const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Resource = require('../models/Resource');
const User = require('../models/User');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { ensureSlot, reserveSlot, releaseSlot } = require('../services/slotService');
const { isBookableSlotStart } = require('../services/availabilityService');
const notifications = require('../services/notificationService');
const {
  createPaymentIntent,
  cancelPaymentIntent,
  refundPaymentIntent,
} = require('../services/paymentService');

const PENDING_TTL_MINUTES = Number(process.env.PENDING_BOOKING_TTL_MINUTES || 15);

/**
 * Creates a booking without ever overbooking a resource, even when requests
 * for the same slot arrive simultaneously.
 *
 * Capacity lives as a counter on one BookingSlot document per
 * (resource, slotStart); see slotService.reserveSlot for why a conditional
 * single-document increment is the part that actually prevents overbooking,
 * and why wrapping count()+insert() in a transaction would not.
 *
 * The transaction here does a different job: it keeps the seat count and the
 * Booking record consistent with each other, so a failed insert can't leave a
 * seat reserved for a booking that doesn't exist.
 */
const createBooking = asyncHandler(async (req, res) => {
  const { resourceId, slotStart } = req.body;

  const resource = await Resource.findById(resourceId);
  if (!resource || !resource.isActive) throw new ApiError(404, 'Resource not found');

  const start = new Date(slotStart);
  if (Number.isNaN(start.getTime())) throw new ApiError(400, 'Invalid slotStart');
  if (start.getTime() <= Date.now()) {
    throw new ApiError(400, 'slotStart must be in the future');
  }
  if (!isBookableSlotStart(resource, start)) {
    throw new ApiError(
      400,
      'slotStart is not an available slot for this resource — see GET /api/resources/:id/availability'
    );
  }

  const end = new Date(start.getTime() + resource.durationMinutes * 60_000);

  // Not race-proof on its own, and deliberately so: the consequence of losing
  // this race is one user holding two seats in a slot they can both be served
  // in, which is a far smaller problem than overbooking and not worth an
  // extra unique index on the hot booking path.
  const duplicate = await Booking.findOne({
    userId: req.user.id,
    resourceId,
    slotStart: start,
    status: { $in: Booking.ACTIVE_STATUSES },
  });
  if (duplicate) throw new ApiError(409, 'You already have a booking for this slot');

  // Must happen before the transaction opens — see slotService.ensureSlot.
  await ensureSlot({ resourceId, slotStart: start, capacity: resource.capacity });

  const session = await mongoose.startSession();
  let booking;
  try {
    await session.withTransaction(async () => {
      const slot = await reserveSlot({ resourceId, slotStart: start, session });
      if (!slot) throw new ApiError(409, 'This slot is fully booked');

      const [created] = await Booking.create(
        [
          {
            userId: req.user.id,
            resourceId,
            slotStart: start,
            slotEnd: end,
            status: 'pending',
            amount: resource.price,
            currency: resource.currency || 'usd',
            expiresAt: new Date(Date.now() + PENDING_TTL_MINUTES * 60_000),
          },
        ],
        { session }
      );
      booking = created;
    });
  } finally {
    await session.endSession();
  }

  // Stripe can't participate in the Mongo transaction, so the booking is
  // committed first and reconciled by webhook. If the intent can't be created
  // at all there is nothing to reconcile, so undo the booking by hand rather
  // than leaving a seat held by a booking that can never be paid.
  let paymentIntent;
  try {
    paymentIntent = await createPaymentIntent({
      amount: booking.amount,
      currency: booking.currency,
      metadata: { bookingId: booking._id.toString(), userId: req.user.id },
      idempotencyKey: `booking_${booking._id}`,
    });
  } catch (err) {
    await Booking.findByIdAndUpdate(booking._id, {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelReason: 'payment_setup_failed',
      expiresAt: null,
    });
    await releaseSlot({ resourceId, slotStart: start });
    throw new ApiError(502, `Could not start payment for this booking: ${err.message}`);
  }

  booking.stripePaymentIntentId = paymentIntent.id;
  await booking.save();

  res.status(201).json({
    booking,
    clientSecret: paymentIntent.client_secret,
    expiresAt: booking.expiresAt,
  });
});

const listMyBookings = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

  const filter = { userId: req.user.id };
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    Booking.find(filter)
      .populate('resourceId', 'name price currency durationMinutes')
      .sort('-createdAt')
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Booking.countDocuments(filter),
  ]);

  res.json({
    items,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

const listAllBookings = asyncHandler(async (req, res) => {
  const { status, resourceId, from, to, page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

  const filter = {};
  if (status) filter.status = status;
  if (resourceId) {
    if (!mongoose.isValidObjectId(resourceId)) throw new ApiError(400, 'Invalid resourceId');
    filter.resourceId = resourceId;
  }
  if (from || to) {
    filter.slotStart = {};
    if (from) filter.slotStart.$gte = parseDate(from, 'from');
    if (to) filter.slotStart.$lt = parseDate(to, 'to');
  }

  const [items, total] = await Promise.all([
    Booking.find(filter)
      .populate('userId', 'name email')
      .populate('resourceId', 'name price currency')
      .sort('-createdAt')
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Booking.countDocuments(filter),
  ]);

  res.json({
    items,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

const getBooking = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Booking not found');

  const booking = await Booking.findById(req.params.id).populate(
    'resourceId',
    'name price currency durationMinutes'
  );
  if (!booking) throw new ApiError(404, 'Booking not found');

  if (!canManage(booking, req.user)) {
    throw new ApiError(403, 'Not allowed to view this booking');
  }
  res.json(booking);
});

const cancelBooking = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Booking not found');

  const existing = await Booking.findById(req.params.id);
  if (!existing) throw new ApiError(404, 'Booking not found');
  if (!canManage(existing, req.user)) {
    throw new ApiError(403, 'Not allowed to cancel this booking');
  }

  // Already in a terminal state — report it rather than releasing a second seat.
  if (['cancelled', 'expired'].includes(existing.status)) return res.json(existing);
  if (existing.status === 'completed') {
    throw new ApiError(409, 'This booking has already been completed');
  }

  const isStaff = ['staff', 'admin'].includes(req.user.role);
  if (!isStaff && existing.slotStart.getTime() <= Date.now()) {
    throw new ApiError(409, 'This slot has already started and can no longer be cancelled');
  }

  // Conditional transition: whichever concurrent request matches first is the
  // only one that proceeds, so the seat is released exactly once even if the
  // user double-clicks or the expiry sweeper fires at the same moment.
  const booking = await Booking.findOneAndUpdate(
    { _id: existing._id, status: { $in: ['pending', 'confirmed'] } },
    {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelReason: isStaff && existing.userId.toString() !== req.user.id ? 'staff_cancelled' : 'user_cancelled',
      expiresAt: null,
    },
    { new: true }
  );
  if (!booking) {
    return res.json(await Booking.findById(existing._id));
  }

  await releaseSlot({ resourceId: booking.resourceId, slotStart: booking.slotStart });

  const refunded = await settlePaymentForCancellation(booking);
  await notifyCancelled(booking, refunded);

  res.json(booking);
});

/**
 * Returns money (or releases the uncaptured intent) for a cancelled booking.
 * Payment-provider failures are logged, not thrown: the cancellation itself
 * has already committed, and reporting it as a 500 would tell the caller
 * their still-cancelled booking is still active.
 */
async function settlePaymentForCancellation(booking) {
  if (!booking.stripePaymentIntentId) return false;

  try {
    if (booking.paymentStatus === 'paid') {
      const refund = await refundPaymentIntent({
        paymentIntentId: booking.stripePaymentIntentId,
        idempotencyKey: `refund_${booking._id}`,
      });
      await Booking.findByIdAndUpdate(booking._id, {
        paymentStatus: 'refunded',
        stripeRefundId: refund.id,
      });
      booking.paymentStatus = 'refunded';
      booking.stripeRefundId = refund.id;
      return true;
    }
    // Nothing captured yet — release the intent so it can't be paid later.
    await cancelPaymentIntent(booking.stripePaymentIntentId);
  } catch (err) {
    console.error(
      `Payment settlement failed for cancelled booking ${booking._id}: ${err.message}`
    );
  }
  return false;
}

async function notifyCancelled(booking, refunded) {
  const [user, resource] = await Promise.all([
    User.findById(booking.userId).select('name email'),
    Resource.findById(booking.resourceId).select('name'),
  ]);
  await notifications.bookingCancelled({
    user,
    booking,
    resourceName: resource?.name || 'your booking',
    refunded,
  });
}

function canManage(booking, user) {
  return booking.userId.toString() === user.id || ['staff', 'admin'].includes(user.role);
}

function parseDate(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, `Invalid ${label} date`);
  return date;
}

module.exports = {
  createBooking,
  listMyBookings,
  listAllBookings,
  getBooking,
  cancelBooking,
};

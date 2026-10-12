const Booking = require('../models/Booking');
const Resource = require('../models/Resource');
const BookingSlot = require('../models/BookingSlot');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 400;

/**
 * Booking and revenue summary over a date range, bucketed by slot date.
 *
 * Revenue is summed from each booking's own `amount` rather than its
 * resource's current price, so changing a price doesn't retroactively rewrite
 * history. Only `paid` bookings count toward revenue; refunds are reported
 * separately so gross and net are both visible.
 *
 * Staff see only resources they own; admins see everything.
 */
const getOverview = asyncHandler(async (req, res) => {
  const to = req.query.to ? parseDate(req.query.to, 'to') : new Date();
  const from = req.query.from
    ? parseDate(req.query.from, 'from')
    : new Date(to.getTime() - 30 * MS_PER_DAY);

  if (to <= from) throw new ApiError(400, '`to` must be after `from`');
  if (to - from > MAX_RANGE_DAYS * MS_PER_DAY) {
    throw new ApiError(400, `Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  }

  const match = { slotStart: { $gte: from, $lt: to } };

  const scopedResourceIds = await getScopedResourceIds(req.user);
  if (scopedResourceIds) {
    if (scopedResourceIds.length === 0) {
      return res.json(emptyOverview(from, to));
    }
    match.resourceId = { $in: scopedResourceIds };
  }

  const [facets] = await Booking.aggregate([
    { $match: match },
    {
      $facet: {
        byStatus: [{ $group: { _id: '$status', bookings: { $sum: 1 }, amount: { $sum: '$amount' } } }],
        byPaymentStatus: [
          { $group: { _id: '$paymentStatus', bookings: { $sum: 1 }, amount: { $sum: '$amount' } } },
        ],
        perResource: [
          {
            $group: {
              _id: '$resourceId',
              bookings: { $sum: 1 },
              cancelled: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'expired']] }, 1, 0] } },
              revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$amount', 0] } },
              refunded: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, '$amount', 0] } },
            },
          },
          { $sort: { revenue: -1, bookings: -1 } },
          { $limit: 25 },
          {
            $lookup: {
              from: Resource.collection.name,
              localField: '_id',
              foreignField: '_id',
              as: 'resource',
            },
          },
          {
            $project: {
              _id: 0,
              resourceId: '$_id',
              name: { $ifNull: [{ $first: '$resource.name' }, '(deleted resource)'] },
              bookings: 1,
              cancelled: 1,
              revenue: 1,
              refunded: 1,
            },
          },
        ],
        byDay: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$slotStart', timezone: 'UTC' } },
              bookings: { $sum: 1 },
              revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$amount', 0] } },
              refunded: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, '$amount', 0] } },
            },
          },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, date: '$_id', bookings: 1, revenue: 1, refunded: 1 } },
        ],
      },
    },
  ]);

  const bookingsByStatus = toCountMap(facets.byStatus, Booking.BOOKING_STATUSES);
  const paymentsByStatus = toCountMap(facets.byPaymentStatus, Booking.PAYMENT_STATUSES);

  const grossRevenue = sumAmount(facets.byPaymentStatus, 'paid');
  const refundedRevenue = sumAmount(facets.byPaymentStatus, 'refunded');

  res.json({
    range: { from, to },
    totals: {
      bookings: Object.values(bookingsByStatus).reduce((a, b) => a + b, 0),
      bookingsByStatus,
      paymentsByStatus,
      grossRevenue,
      refundedRevenue,
      netRevenue: grossRevenue - refundedRevenue,
    },
    occupancy: await getOccupancy({ from, to, resourceIds: scopedResourceIds }),
    topResources: facets.perResource,
    byDay: facets.byDay,
  });
});

/**
 * Seats taken vs. seats offered across every slot in the range.
 *
 * Read from the BookingSlot counters, which only exist for slots that have
 * been booked at least once. That makes this "utilisation of slots that saw
 * demand", not of every slot the opening hours imply — the latter would mean
 * re-expanding every resource's schedule on every request.
 */
async function getOccupancy({ from, to, resourceIds }) {
  const match = { slotStart: { $gte: from, $lt: to } };
  if (resourceIds) match.resourceId = { $in: resourceIds };

  const [result] = await BookingSlot.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        slots: { $sum: 1 },
        seatsOffered: { $sum: '$capacity' },
        seatsTaken: { $sum: '$bookedCount' },
      },
    },
  ]);

  const slots = result?.slots || 0;
  const seatsOffered = result?.seatsOffered || 0;
  const seatsTaken = result?.seatsTaken || 0;

  return {
    slotsWithDemand: slots,
    seatsOffered,
    seatsTaken,
    utilisation: seatsOffered === 0 ? 0 : Number((seatsTaken / seatsOffered).toFixed(4)),
  };
}

/** null means "no restriction" (admin); an array scopes to owned resources. */
async function getScopedResourceIds(user) {
  if (user.role === 'admin') return null;
  const owned = await Resource.find({ ownerId: user.id }).select('_id');
  return owned.map((r) => r._id);
}

function toCountMap(buckets, keys) {
  const map = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const bucket of buckets) {
    if (bucket._id != null) map[bucket._id] = bucket.bookings;
  }
  return map;
}

function sumAmount(buckets, id) {
  return buckets.find((bucket) => bucket._id === id)?.amount || 0;
}

function emptyOverview(from, to) {
  return {
    range: { from, to },
    totals: {
      bookings: 0,
      bookingsByStatus: toCountMap([], Booking.BOOKING_STATUSES),
      paymentsByStatus: toCountMap([], Booking.PAYMENT_STATUSES),
      grossRevenue: 0,
      refundedRevenue: 0,
      netRevenue: 0,
    },
    occupancy: { slotsWithDemand: 0, seatsOffered: 0, seatsTaken: 0, utilisation: 0 },
    topResources: [],
    byDay: [],
  };
}

function parseDate(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, `Invalid ${label} date`);
  return date;
}

module.exports = { getOverview };

const mongoose = require('mongoose');

const BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed', 'expired'];
const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded'];

// Statuses that occupy a seat in the slot. Anything outside this list has had
// its capacity released back to the BookingSlot counter.
const ACTIVE_STATUSES = ['pending', 'confirmed', 'completed'];

const bookingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
    slotStart: { type: Date, required: true },
    slotEnd: { type: Date, required: true },
    status: { type: String, enum: BOOKING_STATUSES, default: 'pending' },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid' },

    // Price is copied onto the booking at creation time. Reading it back off
    // Resource would misreport revenue for any resource whose price changed
    // after the booking was made.
    amount: { type: Number, required: true, min: 0 }, // in cents
    currency: { type: String, default: 'usd', lowercase: true },

    stripePaymentIntentId: { type: String, default: null },
    stripeRefundId: { type: String, default: null },

    // Deadline for completing payment on a `pending` booking. Until it is
    // reached the booking holds a seat; after it, the expiry sweeper releases
    // the seat so an abandoned checkout can't block the slot forever.
    // Cleared once the booking reaches a terminal state.
    expiresAt: { type: Date, default: null },

    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: null },
  },
  { timestamps: true }
);

// Capacity-check and listing queries for a resource+slot.
bookingSchema.index({ resourceId: 1, slotStart: 1, status: 1 });
// "My bookings, newest first".
bookingSchema.index({ userId: 1, createdAt: -1 });
// The expiry sweeper's query: pending bookings past their deadline.
bookingSchema.index({ status: 1, expiresAt: 1 });
// Webhook lookups by payment intent.
bookingSchema.index({ stripePaymentIntentId: 1 }, { sparse: true });

const Booking = mongoose.model('Booking', bookingSchema);

Booking.BOOKING_STATUSES = BOOKING_STATUSES;
Booking.PAYMENT_STATUSES = PAYMENT_STATUSES;
Booking.ACTIVE_STATUSES = ACTIVE_STATUSES;

module.exports = Booking;

const mongoose = require('mongoose');

// One document per (resource, slotStart) pair, holding that slot's seat count.
//
// bookedCount is incremented atomically and conditionally — see
// services/slotService.js. MongoDB guarantees single-document updates are
// atomic, which is what actually prevents overbooking. A multi-document
// transaction around count()+insert() does NOT, because two concurrent
// transactions inserting different new Booking documents never collide, so no
// conflict is ever detected and both pass the capacity check.
//
// `capacity` is a snapshot taken when the slot is first booked. Changing a
// resource's capacity therefore does not retroactively resize slots people
// have already booked into.
const bookingSlotSchema = new mongoose.Schema(
  {
    resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
    slotStart: { type: Date, required: true },
    capacity: { type: Number, required: true },
    bookedCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

bookingSlotSchema.index({ resourceId: 1, slotStart: 1 }, { unique: true });

module.exports = mongoose.model('BookingSlot', bookingSlotSchema);
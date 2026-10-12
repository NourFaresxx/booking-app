const BookingSlot = require('../models/BookingSlot');

/**
 * Creates the counter document for a slot if it doesn't exist yet.
 *
 * Deliberately NOT given a session, and so deliberately not part of the
 * caller's transaction: inside one, losing the create race raises a
 * duplicate-key error that aborts the whole transaction, and an aborted
 * transaction can't be continued even though the error is harmless. Outside
 * one, the same race is just "somebody else created it first", which is the
 * state we wanted anyway.
 */
async function ensureSlot({ resourceId, slotStart, capacity }) {
  try {
    await BookingSlot.updateOne(
      { resourceId, slotStart },
      { $setOnInsert: { resourceId, slotStart, capacity, bookedCount: 0 } },
      { upsert: true }
    );
  } catch (err) {
    // Two simultaneous upserts can still collide on the unique index; the
    // loser's work is already done by the winner.
    if (err.code !== 11000) throw err;
  }
}

/**
 * Takes a seat in a slot, or returns null if the slot is full.
 *
 * The capacity check and the increment are a single conditional update on a
 * single document, which MongoDB applies atomically. That — not a
 * transaction — is what makes this race-free: a `countDocuments()` followed
 * by an `insertOne()` would let concurrent requests both observe the same
 * pre-insert count, because two inserts of different documents never
 * conflict with each other.
 *
 * Call ensureSlot() first; this returns null for a slot that doesn't exist,
 * which is indistinguishable here from a slot that is full.
 */
async function reserveSlot({ resourceId, slotStart, session }) {
  return BookingSlot.findOneAndUpdate(
    { resourceId, slotStart, $expr: { $lt: ['$bookedCount', '$capacity'] } },
    { $inc: { bookedCount: 1 } },
    { new: true, session }
  );
}

/**
 * Returns a seat to the pool. Guarded on `bookedCount > 0` so a double
 * release (duplicate webhook, cancel racing the expiry sweeper) can't drive
 * the counter negative and hand out phantom capacity.
 */
async function releaseSlot({ resourceId, slotStart, session }) {
  const result = await BookingSlot.updateOne(
    { resourceId, slotStart, bookedCount: { $gt: 0 } },
    { $inc: { bookedCount: -1 } },
    { session }
  );
  return result.modifiedCount === 1;
}

/** Current bookedCount per slotStart for a resource, as a Map keyed by ISO string. */
async function getBookedCounts({ resourceId, from, to }) {
  const slots = await BookingSlot.find({
    resourceId,
    slotStart: { $gte: from, $lt: to },
  }).select('slotStart bookedCount capacity');

  return new Map(slots.map((s) => [s.slotStart.toISOString(), s]));
}

module.exports = { ensureSlot, reserveSlot, releaseSlot, getBookedCounts };

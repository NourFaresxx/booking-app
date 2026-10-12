const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');

const createBookingSchema = z.object({
  resourceId: objectId,
  // ISO 8601 with an offset, so the instant is unambiguous. Slot starts must
  // line up with the resource's generated slots; see GET
  // /api/resources/:id/availability.
  slotStart: z.string().datetime({ offset: true }),
});

module.exports = { createBookingSchema };

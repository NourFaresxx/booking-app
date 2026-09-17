const { z } = require('zod');

const createResourceSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  capacity: z.number().int().min(1),
  price: z.number().int().min(0), // cents
  durationMinutes: z.number().int().min(5),
});

const updateResourceSchema = createResourceSchema.partial();

module.exports = { createResourceSchema, updateResourceSchema };

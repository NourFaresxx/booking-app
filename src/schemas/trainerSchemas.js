const { z } = require('zod');

const createTrainerSchema = z.object({
  name: z.string().min(2).max(100),
  title: z.string().max(140).optional(),
  bio: z.string().min(10).max(4000),
  specialties: z.array(z.string().min(1).max(60)).max(20).optional(),
  photoUrl: z.string().url().max(2000).optional(),
  yearsExperience: z.number().int().min(0).max(80).optional(),
  isActive: z.boolean().optional(),
});

const updateTrainerSchema = createTrainerSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'No fields to update' });

module.exports = { createTrainerSchema, updateTrainerSchema };

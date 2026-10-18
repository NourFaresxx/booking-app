const { z } = require('zod');

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a 24-hour time like "09:00"');

const openingHourSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6), // 0 = Sunday
    start: timeOfDay,
    end: timeOfDay,
  })
  .refine((window) => window.end > window.start, {
    message: 'end must be after start; split an overnight window into two same-day windows',
  });

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');

const createResourceSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  category: z.enum(['classes', 'self-care']).optional(),
  capacity: z.number().int().min(1),
  price: z.number().int().min(0), // cents
  currency: z.string().length(3).toLowerCase().optional(),
  durationMinutes: z.number().int().min(5).max(24 * 60),
  openingHours: z.array(openingHourSchema).max(50).optional(),
  timezone: z.string().min(1).max(64).optional(),
  isActive: z.boolean().optional(),
  // Who teaches this class, if anyone. null clears an existing assignment.
  trainerId: objectId.nullable().optional(),
});

const updateResourceSchema = createResourceSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'No fields to update' });

module.exports = { createResourceSchema, updateResourceSchema };

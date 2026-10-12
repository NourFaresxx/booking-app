const { z } = require('zod');

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(254),
  // bcrypt silently ignores bytes past 72, so cap there rather than letting a
  // longer password be accepted and then truncated.
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(72),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

module.exports = { registerSchema, loginSchema, refreshSchema };

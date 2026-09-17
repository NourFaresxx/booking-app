const express = require('express');
const rateLimit = require('express-rate-limit');
const { register, login, refresh, logout } = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../schemas/authSchemas');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Slow down brute-force login/register attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, please try again later' },
});

router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/refresh', refresh);
router.post('/logout', requireAuth, logout);

module.exports = router;

const express = require('express');
const rateLimit = require('express-rate-limit');
const { register, login, refresh, logout, me } = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { registerSchema, loginSchema, refreshSchema } = require('../schemas/authSchemas');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Slow down credential stuffing and brute-force attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

// Refresh is also a credential endpoint — an unlimited one is a free oracle
// for testing stolen refresh tokens. More generous than login because a busy
// client legitimately refreshes on a timer.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.REFRESH_RATE_LIMIT || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many refresh attempts, please try again later' },
});

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Create an account
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, minLength: 2, example: Nour Fares }
 *               email: { type: string, format: email, example: nour@example.com }
 *               password: { type: string, minLength: 8, example: correct-horse-battery }
 *     responses:
 *       201:
 *         description: Account created, tokens issued
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthResponse' }
 *       409: { description: Email already registered }
 *       429: { description: Too many attempts }
 */
router.post('/register', authLimiter, validate(registerSchema), register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange credentials for tokens
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Tokens issued
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthResponse' }
 *       401: { description: Invalid email or password }
 */
router.post('/login', authLimiter, validate(loginSchema), login);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate a refresh token for a new token pair
 *     description: >
 *       The supplied refresh token is invalidated and replaced. Reusing an old
 *       refresh token fails, which limits the damage from a leaked token.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: New token pair
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken: { type: string }
 *                 refreshToken: { type: string }
 *       401: { description: Invalid or expired refresh token }
 */
router.post('/refresh', refreshLimiter, validate(refreshSchema), refresh);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Current user
 *     responses:
 *       200:
 *         description: The authenticated user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/User' }
 *       401: { description: Missing or invalid access token }
 */
router.get('/me', requireAuth, me);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Invalidate the stored refresh token
 *     responses:
 *       204: { description: Logged out }
 *       401: { description: Missing or invalid access token }
 */
router.post('/logout', requireAuth, logout);

module.exports = router;

const bcrypt = require('bcryptjs');
const User = require('../models/User');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
  refreshTokenMatches,
} = require('../utils/tokens');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

// Applies to passwords only. Refresh tokens are hashed with SHA-256 — see
// hashRefreshToken for why bcrypt is both wrong and unsafe for them.
const SALT_ROUNDS = 12;

/**
 * Issues a fresh token pair and stores the refresh token's hash, replacing
 * whatever was there. One stored hash per user means one active refresh token
 * per user: logging in again, or refreshing, invalidates the previous session.
 */
async function issueTokens(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  user.refreshTokenHash = hashRefreshToken(refreshToken);
  await user.save();

  return { accessToken, refreshToken };
}

const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw new ApiError(409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  let user;
  try {
    user = await User.create({ name, email, passwordHash });
  } catch (err) {
    // The findOne above is advisory only; the unique index is what actually
    // enforces this, and it's what catches two simultaneous registrations.
    if (err.code === 11000) throw new ApiError(409, 'An account with this email already exists');
    throw err;
  }

  const tokens = await issueTokens(user);

  res.status(201).json({ user: user.toSafeObject(), ...tokens });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user || !(await user.comparePassword(password))) {
    // Same message for both cases — don't leak which part was wrong.
    throw new ApiError(401, 'Invalid email or password');
  }

  const tokens = await issueTokens(user);

  res.json({ user: user.toSafeObject(), ...tokens });
});

const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.refreshTokenHash) {
    throw new ApiError(401, 'Invalid refresh token');
  }

  // The signature proves the token was issued by us; this proves it is still
  // the current one and hasn't already been spent.
  if (!refreshTokenMatches(refreshToken, user.refreshTokenHash)) {
    throw new ApiError(401, 'Invalid refresh token');
  }

  // Rotate: the token just presented is spent, and only the new one works.
  const tokens = await issueTokens(user);

  res.json(tokens);
});

const logout = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { refreshTokenHash: null });
  res.status(204).send();
});

const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  // The token verified, but the account behind it may since have been removed.
  if (!user) throw new ApiError(401, 'Account no longer exists');
  res.json(user.toSafeObject());
});

module.exports = { register, login, refresh, logout, me };

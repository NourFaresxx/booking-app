const bcrypt = require('bcryptjs');
const User = require('../models/User');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require('../utils/tokens');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

const SALT_ROUNDS = 12;

const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw new ApiError(409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ name, email, passwordHash });

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  user.refreshTokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS);
  await user.save();

  res.status(201).json({ user: user.toSafeObject(), accessToken, refreshToken });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user || !(await user.comparePassword(password))) {
    // Same message for both cases — don't leak which part was wrong.
    throw new ApiError(401, 'Invalid email or password');
  }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  user.refreshTokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS);
  await user.save();

  res.json({ user: user.toSafeObject(), accessToken, refreshToken });
});

const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new ApiError(400, 'refreshToken is required');

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

  const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
  if (!matches) throw new ApiError(401, 'Invalid refresh token');

  // Rotate: issue a new refresh token and invalidate the old one.
  const newAccessToken = signAccessToken(user);
  const newRefreshToken = signRefreshToken(user);
  user.refreshTokenHash = await bcrypt.hash(newRefreshToken, SALT_ROUNDS);
  await user.save();

  res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
});

const logout = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { refreshTokenHash: null });
  res.status(204).send();
});

module.exports = { register, login, refresh, logout };

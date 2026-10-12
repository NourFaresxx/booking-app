const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Every token gets a unique id. Without it the payload is just {sub, iat, exp}
// with `iat` in whole seconds, so two tokens minted for the same user inside
// one second are byte-identical — which would quietly defeat refresh-token
// rotation, since the "new" token would equal the one it was meant to replace
// and the old one would keep working.
function tokenId() {
  return crypto.randomUUID();
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, jti: tokenId() },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), jti: tokenId() },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

/**
 * Hashes a refresh token for storage.
 *
 * SHA-256, not bcrypt, for two reasons.
 *
 * Correctness: bcrypt ignores everything past the first 72 bytes of its
 * input, and a JWT's first 72 bytes are the fixed header plus the start of
 * the payload — `{"sub":"<user id>` — which is byte-identical for every
 * token ever issued to that user. bcrypt therefore cannot tell one of a
 * user's refresh tokens from another, so a rotated token still matched the
 * stored hash and the "old token is now invalid" guarantee silently did not
 * hold.
 *
 * Suitability: bcrypt's cost exists to slow brute force against low-entropy
 * human passwords. A signed JWT already carries full-strength HMAC entropy,
 * so there is nothing to brute-force and a fast digest is the right tool.
 */
function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison, so a mismatch leaks nothing through timing. */
function refreshTokenMatches(token, storedHash) {
  if (typeof storedHash !== 'string' || storedHash.length === 0) return false;

  const candidate = Buffer.from(hashRefreshToken(token), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  // timingSafeEqual throws on a length mismatch, which a legacy bcrypt value
  // in this column would produce.
  if (candidate.length !== stored.length) return false;

  return crypto.timingSafeEqual(candidate, stored);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashRefreshToken,
  refreshTokenMatches,
};

const bcrypt = require('bcryptjs');
const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashRefreshToken,
  refreshTokenMatches,
} = require('../src/utils/tokens');

const user = { _id: { toString: () => '68eb8f1a2b3c4d5e6f708192' }, role: 'customer' };

describe('token signing', () => {
  it('never issues the same token twice, even within the same second', () => {
    const tokens = new Set(Array.from({ length: 20 }, () => signRefreshToken(user)));
    // `iat` has one-second resolution, so without a per-token id these would
    // collide and a "rotated" token would equal the one it replaced.
    expect(tokens.size).toBe(20);
  });

  it('will not accept a refresh token as an access token', () => {
    expect(() => verifyAccessToken(signRefreshToken(user))).toThrow();
    expect(() => verifyRefreshToken(signAccessToken(user))).toThrow();
  });

  it('carries the subject and role in the access token', () => {
    const payload = verifyAccessToken(signAccessToken(user));
    expect(payload.sub).toBe('68eb8f1a2b3c4d5e6f708192');
    expect(payload.role).toBe('customer');
  });

  it('keeps the role out of the refresh token', () => {
    // A refresh token outlives a role change, so a role baked into it would
    // let a demoted user keep minting privileged access tokens.
    expect(verifyRefreshToken(signRefreshToken(user)).role).toBeUndefined();
  });
});

describe('refresh token hashing', () => {
  it('distinguishes two tokens for the same user', () => {
    const first = signRefreshToken(user);
    const second = signRefreshToken(user);

    expect(hashRefreshToken(first)).not.toBe(hashRefreshToken(second));
    expect(refreshTokenMatches(first, hashRefreshToken(first))).toBe(true);
    expect(refreshTokenMatches(first, hashRefreshToken(second))).toBe(false);
  });

  it('demonstrates why bcrypt cannot be used here', async () => {
    const first = signRefreshToken(user);
    const second = signRefreshToken(user);

    // bcrypt ignores everything past 72 bytes, and a JWT's first 72 bytes are
    // the fixed header plus the start of `{"sub":"<user id>` — identical for
    // every token this user is ever issued.
    expect(first.slice(0, 72)).toBe(second.slice(0, 72));
    expect(first).not.toBe(second);

    // So bcrypt reports a match between two genuinely different tokens, which
    // is exactly how rotation used to fail to invalidate the old one.
    expect(await bcrypt.compare(first, await bcrypt.hash(second, 4))).toBe(true);

    // SHA-256 reads the whole token and tells them apart.
    expect(refreshTokenMatches(first, hashRefreshToken(second))).toBe(false);
  });

  it('rejects an empty, malformed, or legacy stored hash instead of throwing', () => {
    const token = signRefreshToken(user);

    expect(refreshTokenMatches(token, null)).toBe(false);
    expect(refreshTokenMatches(token, '')).toBe(false);
    expect(refreshTokenMatches(token, 'not-hex')).toBe(false);
    // A bcrypt value left in the column by an older deployment.
    expect(refreshTokenMatches(token, '$2a$12$abcdefghijklmnopqrstuv')).toBe(false);
  });
});

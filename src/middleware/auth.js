const { verifyAccessToken } = require('../utils/tokens');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Like requireAuth, but never rejects the request — a missing, malformed, or
 * expired token just means req.user stays unset, same as an anonymous call.
 *
 * For routes that are public but behave differently for a logged-in caller
 * (e.g. an admin requesting inactive listings on an otherwise-public browse
 * endpoint). Never use this where the route's own logic depends on req.user
 * existing — that's what requireAuth is for.
 */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.user = { id: payload.sub, role: payload.role };
    } catch {
      // Invalid/expired token on an optional route: proceed as anonymous
      // rather than erroring, since the caller never required auth to begin
      // with — a stale token shouldn't break a page that works fine without one.
    }
  }
  next();
}

module.exports = { requireAuth, requireRole, optionalAuth };

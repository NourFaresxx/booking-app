// Thin wrapper around localStorage. Every call is try/caught because private
// browsing, blocked site data, or a locked-down embed can make localStorage
// throw on access rather than simply being empty — the app should degrade to
// "not logged in", not crash.
const KEY = 'booking.refreshToken';

export function loadRefreshToken() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveRefreshToken(token) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    // Nothing to do — the session just won't survive a reload.
  }
}

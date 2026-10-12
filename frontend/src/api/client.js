import { loadRefreshToken, saveRefreshToken } from '../lib/storage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/** Thrown for any non-2xx response, carrying the server's own error shape. */
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed with status ${status}`);
    this.status = status;
    this.details = body?.details || null;
  }
}

// The access token lives in memory only — never localStorage — so it can't
// be read by anything that persists across a reload (or by an XSS payload
// rummaging through storage after the fact). The refresh token is the one
// value that needs to survive a reload, so only it is persisted.
let accessToken = null;
let refreshToken = loadRefreshToken();

// If several requests 401 at once, only the first should trigger a refresh;
// the rest wait on the same promise rather than each rotating the refresh
// token and invalidating each other's attempt.
let refreshPromise = null;

// Notified when a session can no longer be sustained (refresh failed or
// there was never one), so the UI can drop back to a logged-out state. Set
// by AuthProvider; kept outside React so non-component code (this module)
// can trigger it too.
let onSessionExpired = () => {};

export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

export function setTokens({ accessToken: access, refreshToken: refresh }) {
  accessToken = access ?? null;
  refreshToken = refresh ?? null;
  saveRefreshToken(refreshToken);
}

export function clearTokens() {
  setTokens({ accessToken: null, refreshToken: null });
}

export function hasSession() {
  return Boolean(refreshToken);
}

async function rawRequest(path, { method = 'GET', body, token, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

async function refreshSession() {
  if (!refreshToken) throw new ApiError(401, { error: 'No session' });

  if (!refreshPromise) {
    refreshPromise = rawRequest('/auth/refresh', { method: 'POST', body: { refreshToken } })
      .then((data) => {
        setTokens(data);
        return data;
      })
      .catch((err) => {
        // The stored refresh token is dead — rotation consumed it, it
        // expired, or the account is gone. Nothing short of logging in
        // again will fix this, so drop the session rather than retry.
        clearTokens();
        onSessionExpired();
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

/**
 * Makes an authenticated API call, transparently refreshing once on a 401.
 *
 * `auth: false` skips attaching a token at all (register/login/etc., which
 * are unauthenticated by definition and would otherwise trigger a pointless
 * refresh attempt on a fresh browser with no session).
 */
export async function apiFetch(path, { auth = true, ...options } = {}) {
  if (!auth) return rawRequest(path, options);

  try {
    return await rawRequest(path, { ...options, token: accessToken });
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;

    // The access token may simply not exist yet (first call after a reload,
    // before AuthProvider has refreshed) or have expired — either way, try
    // once to establish a fresh one before giving up.
    await refreshSession();
    return rawRequest(path, { ...options, token: accessToken });
  }
}

export { API_URL };

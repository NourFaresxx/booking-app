import { apiFetch, setTokens, clearTokens } from './client';

export async function register({ name, email, password }) {
  const data = await apiFetch('/auth/register', { method: 'POST', body: { name, email, password }, auth: false });
  setTokens(data);
  return data.user;
}

export async function login({ email, password }) {
  const data = await apiFetch('/auth/login', { method: 'POST', body: { email, password }, auth: false });
  setTokens(data);
  return data.user;
}

export async function fetchCurrentUser() {
  return apiFetch('/auth/me');
}

export async function logout() {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } finally {
    // Clear locally regardless of whether the server call succeeded — a
    // failed logout request shouldn't leave the browser looking logged in.
    clearTokens();
  }
}

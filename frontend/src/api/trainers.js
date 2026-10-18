import { apiFetch } from './client';

function toQueryString(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  }
  const string = query.toString();
  return string ? `?${string}` : '';
}

export async function listTrainers(params = {}) {
  return apiFetch(`/trainers${toQueryString(params)}`, { auth: false });
}

/** Returns `{ trainer, classes }` — the profile plus the active classes they teach. */
export async function getTrainer(id) {
  return apiFetch(`/trainers/${id}`, { auth: false });
}

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
  return apiFetch(`/trainers${toQueryString(params)}`, { auth: Boolean(params.includeInactive) });
}

/** Returns `{ trainer, classes }` — the profile plus the active classes they teach. */
export async function getTrainer(id) {
  return apiFetch(`/trainers/${id}`, { auth: false });
}

export async function createTrainer(data) {
  return apiFetch('/trainers', { method: 'POST', body: data });
}

export async function updateTrainer(id, data) {
  return apiFetch(`/trainers/${id}`, { method: 'PATCH', body: data });
}

/** Soft delete (deactivate) — see updateTrainer({isActive: true}) to reactivate. */
export async function deleteTrainer(id) {
  return apiFetch(`/trainers/${id}`, { method: 'DELETE' });
}

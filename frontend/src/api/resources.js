import { apiFetch } from './client';

function toQueryString(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  }
  const string = query.toString();
  return string ? `?${string}` : '';
}

export async function listResources(params = {}) {
  // `includeInactive` is silently ignored by the API unless the caller is
  // authenticated as staff/admin, so it's safe to always attach a token when
  // one exists rather than branch on who's asking.
  return apiFetch(`/resources${toQueryString(params)}`, { auth: Boolean(params.includeInactive) });
}

export async function getResource(id) {
  return apiFetch(`/resources/${id}`, { auth: false });
}

export async function getAvailability(id, { from, to } = {}) {
  return apiFetch(`/resources/${id}/availability${toQueryString({ from, to })}`, { auth: false });
}

export async function createResource(data) {
  return apiFetch('/resources', { method: 'POST', body: data });
}

export async function updateResource(id, data) {
  return apiFetch(`/resources/${id}`, { method: 'PATCH', body: data });
}

/** Soft delete (deactivate) — see updateResource({isActive: true}) to reactivate. */
export async function deleteResource(id) {
  return apiFetch(`/resources/${id}`, { method: 'DELETE' });
}

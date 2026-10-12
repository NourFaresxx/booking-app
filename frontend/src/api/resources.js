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
  return apiFetch(`/resources${toQueryString(params)}`, { auth: false });
}

export async function getResource(id) {
  return apiFetch(`/resources/${id}`, { auth: false });
}

export async function getAvailability(id, { from, to } = {}) {
  return apiFetch(`/resources/${id}/availability${toQueryString({ from, to })}`, { auth: false });
}

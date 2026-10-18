import { apiFetch } from './client';

export async function getOverview({ from, to } = {}) {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiFetch(`/analytics/overview${suffix}`);
}

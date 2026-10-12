import { apiFetch } from './client';

export async function createBooking({ resourceId, slotStart }) {
  return apiFetch('/bookings', { method: 'POST', body: { resourceId, slotStart } });
}

export async function listMyBookings(params = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiFetch(`/bookings/me${suffix}`);
}

export async function getBooking(id) {
  return apiFetch(`/bookings/${id}`);
}

export async function cancelBooking(id) {
  return apiFetch(`/bookings/${id}/cancel`, { method: 'PATCH' });
}

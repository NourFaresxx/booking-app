import { useCallback, useEffect, useState } from 'react';
import { listMyBookings, cancelBooking } from '../api/bookings';
import StatusBadge from '../components/StatusBadge';
import ErrorMessage from '../components/ErrorMessage';
import { formatDateTime, formatMoney } from '../lib/formatters';

const CANCELLABLE_STATUSES = new Set(['pending', 'confirmed']);

export default function MyBookingsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listMyBookings();
      setItems(data.items);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCancel(booking) {
    const resourceName = booking.resourceId?.name || 'this booking';
    if (!window.confirm(`Cancel your booking for ${resourceName}?`)) return;

    setCancellingId(booking._id);
    setError(null);
    try {
      const updated = await cancelBooking(booking._id);
      setItems((current) => current.map((item) => (item._id === updated._id ? updated : item)));
    } catch (err) {
      setError(err);
    } finally {
      setCancellingId(null);
    }
  }

  const upcomingFirst = [...items].sort((a, b) => new Date(a.slotStart) - new Date(b.slotStart));

  return (
    <div className="page">
      <h1>My bookings</h1>
      <ErrorMessage error={error} />

      {loading ? (
        <p className="page-loading">Loading…</p>
      ) : upcomingFirst.length === 0 ? (
        <p className="empty-state">You haven't booked anything yet.</p>
      ) : (
        <ul className="booking-list">
          {upcomingFirst.map((booking) => {
            const slotHasStarted = new Date(booking.slotStart).getTime() <= Date.now();
            const canCancel = CANCELLABLE_STATUSES.has(booking.status) && !slotHasStarted;

            return (
              <li key={booking._id} className="booking-item">
                <div className="booking-item-main">
                  <h3>{booking.resourceId?.name || 'Resource'}</h3>
                  <p>{formatDateTime(booking.slotStart)}</p>
                  <p className="booking-item-amount">{formatMoney(booking.amount, booking.currency)}</p>
                </div>
                <div className="booking-item-side">
                  <StatusBadge status={booking.status} />
                  {canCancel && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      disabled={cancellingId === booking._id}
                      onClick={() => handleCancel(booking)}
                    >
                      {cancellingId === booking._id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

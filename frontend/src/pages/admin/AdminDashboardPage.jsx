import { useEffect, useState } from 'react';
import { getOverview } from '../../api/analytics';
import StatTile from '../../components/StatTile';
import ErrorMessage from '../../components/ErrorMessage';
import { formatMoney } from '../../lib/formatters';

export default function AdminDashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getOverview()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="page-loading">Loading…</p>;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return null;

  const { totals, occupancy, topResources, byDay, range } = data;

  return (
    <div className="admin-section">
      <p className="page-subtitle">
        {new Date(range.from).toLocaleDateString()} – {new Date(range.to).toLocaleDateString()}
      </p>

      <div className="stat-grid">
        <StatTile label="Bookings" value={totals.bookings} />
        <StatTile label="Gross revenue" value={formatMoney(totals.grossRevenue)} />
        <StatTile
          label="Net revenue"
          value={formatMoney(totals.netRevenue)}
          sublabel={totals.refundedRevenue > 0 ? `${formatMoney(totals.refundedRevenue)} refunded` : undefined}
        />
        <StatTile
          label="Seat utilisation"
          value={`${Math.round(occupancy.utilisation * 100)}%`}
          sublabel={`${occupancy.seatsTaken} / ${occupancy.seatsOffered} seats`}
        />
      </div>

      <h2 className="section-heading">Top classes by revenue</h2>
      {topResources.length === 0 ? (
        <p className="empty-state">No bookings in this range yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Bookings</th>
                <th>Cancelled</th>
                <th>Revenue</th>
                <th>Refunded</th>
              </tr>
            </thead>
            <tbody>
              {topResources.map((r) => (
                <tr key={r.resourceId}>
                  <td>{r.name}</td>
                  <td>{r.bookings}</td>
                  <td>{r.cancelled}</td>
                  <td>{formatMoney(r.revenue)}</td>
                  <td>{formatMoney(r.refunded)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="section-heading">Bookings by day</h2>
      {byDay.length === 0 ? (
        <p className="empty-state">No activity in this range yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Bookings</th>
                <th>Revenue</th>
                <th>Refunded</th>
              </tr>
            </thead>
            <tbody>
              {byDay.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{d.bookings}</td>
                  <td>{formatMoney(d.revenue)}</td>
                  <td>{formatMoney(d.refunded)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

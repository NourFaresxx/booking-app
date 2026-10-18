import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listTrainers, updateTrainer } from '../../api/trainers';
import ErrorMessage from '../../components/ErrorMessage';

export default function AdminTrainersPage() {
  const [items, setItems] = useState([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTrainers({ limit: 100, includeInactive: showInactive });
      setItems(data.items);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(trainer) {
    setTogglingId(trainer._id);
    setError(null);
    try {
      await updateTrainer(trainer._id, { isActive: !trainer.isActive });
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="admin-section">
      <div className="page-header">
        <h2 className="admin-section-title">Trainers</h2>
        <div className="admin-toolbar">
          <label className="inline-check">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
          <Link to="/admin/trainers/new" className="btn btn-primary">
            + New trainer
          </Link>
        </div>
      </div>

      <ErrorMessage error={error} />

      {loading ? (
        <p className="page-loading">Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty-state">No trainers yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Title</th>
                <th>Specialties</th>
                <th>Status</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {items.map((trainer) => (
                <tr key={trainer._id}>
                  <td>{trainer.name}</td>
                  <td>{trainer.title || '—'}</td>
                  <td>{trainer.specialties.join(', ') || '—'}</td>
                  <td>
                    <span className={`badge ${trainer.isActive ? 'badge-good' : 'badge-neutral'}`}>
                      {trainer.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="data-table-actions">
                    <Link to={`/admin/trainers/${trainer._id}/edit`} className="btn btn-ghost btn-small">
                      Edit
                    </Link>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      disabled={togglingId === trainer._id}
                      onClick={() => toggleActive(trainer)}
                    >
                      {togglingId === trainer._id
                        ? '…'
                        : trainer.isActive
                          ? 'Deactivate'
                          : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

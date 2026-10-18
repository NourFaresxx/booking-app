import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listResources, updateResource } from '../../api/resources';
import ErrorMessage from '../../components/ErrorMessage';
import { formatMoney } from '../../lib/formatters';

const CATEGORY_LABELS = { classes: 'Classes', 'self-care': 'Self Care' };

export default function AdminClassesPage() {
  const [items, setItems] = useState([]);
  const [showInactive, setShowInactive] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listResources({
        limit: 100,
        includeInactive: showInactive,
        category: categoryFilter || undefined,
      });
      setItems(data.items);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [showInactive, categoryFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(resource) {
    setTogglingId(resource._id);
    setError(null);
    try {
      await updateResource(resource._id, { isActive: !resource.isActive });
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
        <h2 className="admin-section-title">Resources</h2>
        <div className="admin-toolbar">
          <select
            className="admin-filter-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            <option value="classes">Classes</option>
            <option value="self-care">Self Care</option>
          </select>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
          <Link to="/admin/classes/new" className="btn btn-primary">
            + New
          </Link>
        </div>
      </div>

      <ErrorMessage error={error} />

      {loading ? (
        <p className="page-loading">Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty-state">No classes yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Trainer</th>
                <th>Price</th>
                <th>Capacity</th>
                <th>Status</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {items.map((resource) => (
                <tr key={resource._id}>
                  <td>{resource.name}</td>
                  <td>{CATEGORY_LABELS[resource.category] || resource.category}</td>
                  <td>{resource.trainerId?.name || '—'}</td>
                  <td>{formatMoney(resource.price, resource.currency)}</td>
                  <td>{resource.capacity}</td>
                  <td>
                    <span className={`badge ${resource.isActive ? 'badge-good' : 'badge-neutral'}`}>
                      {resource.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="data-table-actions">
                    <Link to={`/admin/classes/${resource._id}/edit`} className="btn btn-ghost btn-small">
                      Edit
                    </Link>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      disabled={togglingId === resource._id}
                      onClick={() => toggleActive(resource)}
                    >
                      {togglingId === resource._id
                        ? '…'
                        : resource.isActive
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

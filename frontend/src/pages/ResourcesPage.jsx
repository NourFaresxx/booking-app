import { useCallback, useEffect, useState } from 'react';
import { listResources } from '../api/resources';
import ResourceCard from '../components/ResourceCard';
import ErrorMessage from '../components/ErrorMessage';

// Debounced so every keystroke in the search box doesn't fire a request.
function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function ResourcesPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listResources({ search: debouncedSearch, limit: 50 });
      if (!signal.aborted) setItems(data.items);
    } catch (err) {
      if (!signal.aborted) setError(err);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Browse resources</h1>
        <input
          type="search"
          placeholder="Search by name or description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
          aria-label="Search resources"
        />
      </div>

      <ErrorMessage error={error} />

      {loading ? (
        <p className="page-loading">Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty-state">No resources found.</p>
      ) : (
        <div className="resource-grid">
          {items.map((resource) => (
            <ResourceCard key={resource._id} resource={resource} />
          ))}
        </div>
      )}
    </div>
  );
}

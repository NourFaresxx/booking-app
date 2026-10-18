import { useCallback, useEffect, useState } from 'react';
import { listResources } from '../api/resources';
import ResourceCard from '../components/ResourceCard';
import ErrorMessage from '../components/ErrorMessage';
import SkeletonGrid from '../components/SkeletonGrid';

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Spa, sauna, massage, and anything else booked as relaxation rather than exercise. */
export default function SelfCarePage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (signal) => {
      setLoading(true);
      setError(null);
      try {
        const data = await listResources({ search: debouncedSearch, category: 'self-care', limit: 50 });
        if (!signal.aborted) setItems(data.items);
      } catch (err) {
        if (!signal.aborted) setError(err);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [debouncedSearch]
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Self care</h1>
          <p className="page-subtitle">Spa, sauna, and massage — book some time for yourself.</p>
        </div>
        <input
          type="search"
          placeholder="Search self care…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
          aria-label="Search self care"
        />
      </div>

      <ErrorMessage error={error} />

      {loading ? (
        <SkeletonGrid count={3} />
      ) : items.length === 0 ? (
        <p className="empty-state">Nothing here yet.</p>
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

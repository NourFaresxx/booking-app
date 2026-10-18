import { useCallback, useEffect, useState } from 'react';
import { listResources } from '../api/resources';
import { listTrainers } from '../api/trainers';
import ResourceCard from '../components/ResourceCard';
import ErrorMessage from '../components/ErrorMessage';
import Hero from '../components/Hero';
import SkeletonGrid from '../components/SkeletonGrid';

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
  const [total, setTotal] = useState(null);
  const [trainerCount, setTrainerCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listResources({ search: debouncedSearch, category: 'class', limit: 50 });
      if (!signal.aborted) {
        setItems(data.items);
        setTotal(data.pagination.total);
      }
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

  // Fetched once, independent of the search box — this is the "how many
  // trainers do we have" stat for the hero, not a filtered count.
  useEffect(() => {
    const controller = new AbortController();
    listTrainers({ limit: 1 })
      .then((data) => {
        if (!controller.signal.aborted) setTrainerCount(data.pagination.total);
      })
      .catch(() => {
        // A failed stat fetch just means the hero skips this number — not
        // worth surfacing as a page-level error.
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="page">
      <Hero
        search={search}
        onSearchChange={setSearch}
        classCount={total}
        trainerCount={trainerCount}
      />

      <ErrorMessage error={error} />

      {loading ? (
        <SkeletonGrid count={6} />
      ) : items.length === 0 ? (
        <p className="empty-state">No classes found.</p>
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

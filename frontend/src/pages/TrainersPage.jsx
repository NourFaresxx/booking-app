import { useCallback, useEffect, useState } from 'react';
import { listTrainers } from '../api/trainers';
import TrainerCard from '../components/TrainerCard';
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

export default function TrainersPage() {
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
        const data = await listTrainers({ search: debouncedSearch, limit: 50 });
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
          <h1>Meet our trainers</h1>
          <p className="page-subtitle">Pick a trainer, see what they teach, and book a class.</p>
        </div>
        <input
          type="search"
          placeholder="Search by name or specialty…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
          aria-label="Search trainers"
        />
      </div>

      <ErrorMessage error={error} />

      {loading ? (
        <SkeletonGrid count={6} />
      ) : items.length === 0 ? (
        <p className="empty-state">No trainers found.</p>
      ) : (
        <div className="trainer-grid">
          {items.map((trainer) => (
            <TrainerCard key={trainer._id} trainer={trainer} />
          ))}
        </div>
      )}
    </div>
  );
}

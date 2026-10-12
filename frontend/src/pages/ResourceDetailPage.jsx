import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getResource, getAvailability } from '../api/resources';
import { useAuth } from '../context/AuthContext';
import SlotPicker from '../components/SlotPicker';
import ErrorMessage from '../components/ErrorMessage';
import { formatMoney } from '../lib/formatters';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Midnight today, in the viewer's local timezone — a stable anchor for "week 0". */
function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export default function ResourceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [resource, setResource] = useState(null);
  const [resourceError, setResourceError] = useState(null);

  const [weekOffset, setWeekOffset] = useState(0);
  const [slots, setSlots] = useState([]);
  const [availabilityError, setAvailabilityError] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const range = useMemo(() => {
    const from = new Date(startOfToday().getTime() + weekOffset * WEEK_MS);
    const to = new Date(from.getTime() + WEEK_MS);
    return { from, to };
  }, [weekOffset]);

  useEffect(() => {
    getResource(id)
      .then(setResource)
      .catch(setResourceError);
  }, [id]);

  const loadAvailability = useCallback(
    async (signal) => {
      setLoadingSlots(true);
      setAvailabilityError(null);
      try {
        const data = await getAvailability(id, {
          from: range.from.toISOString(),
          to: range.to.toISOString(),
        });
        if (!signal.aborted) setSlots(data.slots);
      } catch (err) {
        if (!signal.aborted) setAvailabilityError(err);
      } finally {
        if (!signal.aborted) setLoadingSlots(false);
      }
    },
    [id, range]
  );

  useEffect(() => {
    const controller = new AbortController();
    setSelectedSlot(null);
    loadAvailability(controller.signal);
    return () => controller.abort();
  }, [loadAvailability]);

  function handleContinue() {
    if (!selectedSlot) return;
    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: `/resources/${id}` } } });
      return;
    }
    navigate('/checkout', {
      state: { resourceId: id, slotStart: selectedSlot.start, resourceName: resource?.name },
    });
  }

  if (resourceError) {
    return (
      <div className="page">
        <ErrorMessage error={resourceError} />
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="page">
        <p className="page-loading">Loading…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="resource-detail-header">
        <div>
          <h1>{resource.name}</h1>
          {resource.description && <p className="resource-detail-desc">{resource.description}</p>}
        </div>
        <div className="resource-detail-price">
          {formatMoney(resource.price, resource.currency)}
          <span className="resource-detail-duration">{resource.durationMinutes} min</span>
        </div>
      </div>

      <section className="availability-section">
        <div className="availability-nav">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setWeekOffset((w) => w - 1)}
            disabled={weekOffset <= 0}
          >
            ← Previous week
          </button>
          <span>
            {range.from.toLocaleDateString()} – {new Date(range.to.getTime() - 1).toLocaleDateString()}
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => setWeekOffset((w) => w + 1)}>
            Next week →
          </button>
        </div>

        <ErrorMessage error={availabilityError} />

        {loadingSlots ? (
          <p className="page-loading">Loading availability…</p>
        ) : (
          <SlotPicker slots={slots} selected={selectedSlot} onSelect={setSelectedSlot} />
        )}
      </section>

      <div className="booking-cta">
        <button type="button" className="btn btn-primary" disabled={!selectedSlot} onClick={handleContinue}>
          {selectedSlot ? 'Continue to payment' : 'Select a time slot'}
        </button>
      </div>
    </div>
  );
}

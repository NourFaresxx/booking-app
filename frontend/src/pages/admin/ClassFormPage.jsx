import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getResource, createResource, updateResource } from '../../api/resources';
import { listTrainers } from '../../api/trainers';
import OpeningHoursEditor from '../../components/OpeningHoursEditor';
import ErrorMessage from '../../components/ErrorMessage';

const EMPTY_FORM = {
  name: '',
  description: '',
  category: 'classes',
  capacity: '10',
  priceDollars: '0.00',
  durationMinutes: '60',
  timezone: 'UTC',
  trainerId: '',
  openingHours: [],
};

const COMMON_TIMEZONES = [
  'UTC',
  'Europe/Berlin',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Asia/Dubai',
];

export default function ClassFormPage() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(isEditing);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Trainers only — a failed fetch here just means an empty dropdown, not
    // a broken form, so it isn't treated as a page-level error.
    listTrainers({ limit: 100 })
      .then((data) => setTrainers(data.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEditing) return;
    getResource(id)
      .then((resource) => {
        setForm({
          name: resource.name,
          description: resource.description || '',
          category: resource.category || 'classes',
          capacity: String(resource.capacity),
          priceDollars: (resource.price / 100).toFixed(2),
          durationMinutes: String(resource.durationMinutes),
          timezone: resource.timezone || 'UTC',
          trainerId: resource.trainerId?._id || resource.trainerId || '',
          openingHours: resource.openingHours || [],
        });
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id, isEditing]);

  function update(patch) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      name: form.name,
      description: form.description || undefined,
      category: form.category,
      capacity: Math.round(Number(form.capacity)),
      price: Math.round(Number(form.priceDollars) * 100),
      durationMinutes: Math.round(Number(form.durationMinutes)),
      timezone: form.timezone,
      trainerId: form.trainerId || null,
      openingHours: form.openingHours,
    };

    try {
      if (isEditing) await updateResource(id, payload);
      else await createResource(payload);
      navigate('/admin/classes');
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  }

  if (loading) return <p className="page-loading">Loading…</p>;

  return (
    <div className="admin-section">
      <h2 className="admin-section-title">{isEditing ? 'Edit class' : 'New class'}</h2>

      <form className="admin-form" onSubmit={handleSubmit}>
        <ErrorMessage error={error} />

        <label>
          Name
          <input
            type="text"
            required
            minLength={2}
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </label>

        <label>
          Description
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => update({ description: e.target.value })}
          />
        </label>

        <label>
          Category
          <select value={form.category} onChange={(e) => update({ category: e.target.value })}>
            <option value="classes">Classes (shows on the Classes page)</option>
            <option value="self-care">Self Care</option>
          </select>
        </label>

        <div className="admin-form-row">
          <label>
            Capacity
            <input
              type="number"
              min="1"
              step="1"
              required
              value={form.capacity}
              onChange={(e) => update({ capacity: e.target.value })}
            />
          </label>
          <label>
            Price (USD)
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={form.priceDollars}
              onChange={(e) => update({ priceDollars: e.target.value })}
            />
          </label>
          <label>
            Duration (minutes)
            <input
              type="number"
              min="5"
              step="1"
              required
              value={form.durationMinutes}
              onChange={(e) => update({ durationMinutes: e.target.value })}
            />
          </label>
        </div>

        <div className="admin-form-row">
          <label>
            Trainer
            <select value={form.trainerId} onChange={(e) => update({ trainerId: e.target.value })}>
              <option value="">No trainer</option>
              {trainers.map((trainer) => (
                <option key={trainer._id} value={trainer._id}>
                  {trainer.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Timezone
            <input
              type="text"
              list="timezone-options"
              value={form.timezone}
              onChange={(e) => update({ timezone: e.target.value })}
              placeholder="e.g. Europe/Berlin"
            />
            <datalist id="timezone-options">
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
          </label>
        </div>

        <label>Opening hours</label>
        <OpeningHoursEditor
          value={form.openingHours}
          onChange={(openingHours) => update({ openingHours })}
        />

        <div className="admin-form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/admin/classes')}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : isEditing ? 'Save changes' : 'Create class'}
          </button>
        </div>
      </form>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTrainer, createTrainer, updateTrainer } from '../../api/trainers';
import TagInput from '../../components/TagInput';
import ErrorMessage from '../../components/ErrorMessage';

const EMPTY_FORM = {
  name: '',
  title: '',
  bio: '',
  specialties: [],
  photoUrl: '',
  yearsExperience: '',
};

export default function TrainerFormPage() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(isEditing);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEditing) return;
    // getTrainer returns { trainer, classes } — only the profile matters here.
    getTrainer(id)
      .then(({ trainer }) => {
        setForm({
          name: trainer.name,
          title: trainer.title || '',
          bio: trainer.bio,
          specialties: trainer.specialties || [],
          photoUrl: trainer.photoUrl || '',
          yearsExperience: trainer.yearsExperience != null ? String(trainer.yearsExperience) : '',
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
      title: form.title || undefined,
      bio: form.bio,
      specialties: form.specialties,
      photoUrl: form.photoUrl || undefined,
      yearsExperience: form.yearsExperience === '' ? undefined : Number(form.yearsExperience),
    };

    try {
      if (isEditing) await updateTrainer(id, payload);
      else await createTrainer(payload);
      navigate('/admin/trainers');
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  }

  if (loading) return <p className="page-loading">Loading…</p>;

  return (
    <div className="admin-section">
      <h2 className="admin-section-title">{isEditing ? 'Edit trainer' : 'New trainer'}</h2>

      <form className="admin-form" onSubmit={handleSubmit}>
        <ErrorMessage error={error} />

        <div className="admin-form-row">
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
            Title
            <input
              type="text"
              value={form.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="e.g. Certified Pilates Instructor"
            />
          </label>
        </div>

        <label>
          Bio
          <textarea
            rows={5}
            required
            minLength={10}
            value={form.bio}
            onChange={(e) => update({ bio: e.target.value })}
          />
        </label>

        <label>
          Specialties
          <TagInput
            value={form.specialties}
            onChange={(specialties) => update({ specialties })}
            placeholder="Type and press Enter"
          />
        </label>

        <div className="admin-form-row">
          <label>
            Photo URL
            <input
              type="url"
              value={form.photoUrl}
              onChange={(e) => update({ photoUrl: e.target.value })}
              placeholder="https://…"
            />
          </label>
          <label>
            Years of experience
            <input
              type="number"
              min="0"
              step="1"
              value={form.yearsExperience}
              onChange={(e) => update({ yearsExperience: e.target.value })}
            />
          </label>
        </div>

        <div className="admin-form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/admin/trainers')}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : isEditing ? 'Save changes' : 'Create trainer'}
          </button>
        </div>
      </form>
    </div>
  );
}

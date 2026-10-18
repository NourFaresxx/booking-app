import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getTrainer } from '../api/trainers';
import ResourceCard from '../components/ResourceCard';
import ErrorMessage from '../components/ErrorMessage';

export default function TrainerDetailPage() {
  const { id } = useParams();

  const [trainer, setTrainer] = useState(null);
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getTrainer(id)
      .then((data) => {
        if (cancelled) return;
        setTrainer(data.trainer);
        setClasses(data.classes);
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
  }, [id]);

  if (loading) {
    return (
      <div className="page">
        <p className="page-loading">Loading…</p>
      </div>
    );
  }

  if (error || !trainer) {
    return (
      <div className="page">
        <ErrorMessage error={error} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="trainer-detail-header">
        <div className="trainer-detail-avatar" aria-hidden="true">
          {trainer.photoUrl ? (
            <img src={trainer.photoUrl} alt="" />
          ) : (
            <span>{initials(trainer.name)}</span>
          )}
        </div>
        <div>
          <h1>{trainer.name}</h1>
          {trainer.title && <p className="trainer-detail-title">{trainer.title}</p>}
          {trainer.specialties?.length > 0 && (
            <ul className="trainer-detail-specialties">
              {trainer.specialties.map((specialty) => (
                <li key={specialty}>{specialty}</li>
              ))}
            </ul>
          )}
          {trainer.yearsExperience != null && (
            <p className="trainer-detail-experience">
              {trainer.yearsExperience} year{trainer.yearsExperience === 1 ? '' : 's'} of experience
            </p>
          )}
        </div>
      </div>

      <p className="trainer-detail-bio">{trainer.bio}</p>

      <h2 className="section-heading">Classes taught by {trainer.name.split(' ')[0]}</h2>
      {classes.length === 0 ? (
        <p className="empty-state">No active classes right now.</p>
      ) : (
        <div className="resource-grid">
          {classes.map((resource) => (
            <ResourceCard key={resource._id} resource={resource} />
          ))}
        </div>
      )}
    </div>
  );
}

function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

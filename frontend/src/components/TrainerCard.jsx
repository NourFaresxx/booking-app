import { Link } from 'react-router-dom';

export default function TrainerCard({ trainer }) {
  return (
    <Link to={`/trainers/${trainer._id}`} className="trainer-card">
      <div className="trainer-card-avatar" aria-hidden="true">
        {trainer.photoUrl ? (
          <img src={trainer.photoUrl} alt="" />
        ) : (
          <span>{initials(trainer.name)}</span>
        )}
      </div>
      <div className="trainer-card-body">
        <h3>{trainer.name}</h3>
        {trainer.title && <p className="trainer-card-title">{trainer.title}</p>}
        {trainer.specialties?.length > 0 && (
          <ul className="trainer-card-specialties">
            {trainer.specialties.slice(0, 3).map((specialty) => (
              <li key={specialty}>{specialty}</li>
            ))}
          </ul>
        )}
      </div>
    </Link>
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

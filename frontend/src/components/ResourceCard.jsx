import { Link } from 'react-router-dom';
import { formatMoney } from '../lib/formatters';

export default function ResourceCard({ resource }) {
  // Populated by the API as { _id, name, title, photoUrl }; absent for
  // resources with no trainer (rooms, equipment) or when the id wasn't
  // populated by the endpoint that returned this resource.
  const trainerName = resource.trainerId?.name;

  return (
    <Link to={`/resources/${resource._id}`} className="resource-card">
      <h3>{resource.name}</h3>
      {trainerName && <p className="resource-card-trainer">with {trainerName}</p>}
      {resource.description && <p className="resource-card-desc">{resource.description}</p>}
      <dl className="resource-card-meta">
        <div>
          <dt>Price</dt>
          <dd>{formatMoney(resource.price, resource.currency)}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{resource.durationMinutes} min</dd>
        </div>
        <div>
          <dt>Capacity</dt>
          <dd>{resource.capacity}</dd>
        </div>
      </dl>
    </Link>
  );
}

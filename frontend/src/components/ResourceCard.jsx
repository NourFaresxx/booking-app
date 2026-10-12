import { Link } from 'react-router-dom';
import { formatMoney } from '../lib/formatters';

export default function ResourceCard({ resource }) {
  return (
    <Link to={`/resources/${resource._id}`} className="resource-card">
      <h3>{resource.name}</h3>
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

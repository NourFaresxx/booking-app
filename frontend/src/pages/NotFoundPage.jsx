import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="page empty-state">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Back to browsing</Link>
      </p>
    </div>
  );
}

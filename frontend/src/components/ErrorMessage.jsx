import { ApiError } from '../api/client';

/** Renders an ApiError's message plus, for a 400 validation failure, each field's issue. */
export default function ErrorMessage({ error }) {
  if (!error) return null;

  const message = error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
  const details = error instanceof ApiError ? error.details : null;

  return (
    <div className="error-message" role="alert">
      <p>{message}</p>
      {details && details.length > 0 && (
        <ul>
          {details.map((detail, index) => (
            <li key={`${detail.path}-${index}`}>
              {detail.path ? `${detail.path}: ` : ''}
              {detail.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Gates a route on an active session, remembering where to return after login. */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Wait for the silent session check (see AuthProvider) rather than
  // redirecting a genuinely logged-in user who just hasn't been confirmed
  // yet on this page load.
  if (loading) return <div className="page-loading">Loading…</div>;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

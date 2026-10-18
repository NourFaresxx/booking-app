import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Gates a route on an active session, remembering where to return after
 * login. Pass `roles` to also require the user's role be one of them — a
 * logged-in customer hitting an admin-only route is sent back to Browse
 * rather than treated like an unauthenticated one (login would be useless
 * to them; they're already logged in, they just can't be here).
 */
export default function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  // Wait for the silent session check (see AuthProvider) rather than
  // redirecting a genuinely logged-in user who just hasn't been confirmed
  // yet on this page load.
  if (loading) return <div className="page-loading">Loading…</div>;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

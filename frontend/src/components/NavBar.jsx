import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BrandMark from './BrandMark';

export default function NavBar() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <header className="nav">
      <Link to="/" className="nav-brand">
        <BrandMark className="nav-brand-mark" />
        Rehab Sporting Club Gym
      </Link>
      <nav className="nav-links">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : undefined)}>
          Browse
        </NavLink>
        <NavLink to="/trainers" className={({ isActive }) => (isActive ? 'active' : undefined)}>
          Trainers
        </NavLink>
        {isAuthenticated && (
          <NavLink to="/bookings" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            My bookings
          </NavLink>
        )}
      </nav>
      <div className="nav-auth">
        {isAuthenticated ? (
          <>
            <span className="nav-user">{user.name}</span>
            <button type="button" className="btn btn-ghost" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn btn-ghost">
              Log in
            </Link>
            <Link to="/register" className="btn btn-primary">
              Sign up
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

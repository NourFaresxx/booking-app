import { Link } from 'react-router-dom';
import BrandMark from './BrandMark';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <BrandMark />
          <span>Booking</span>
        </div>
        <nav className="site-footer-links">
          <Link to="/">Browse</Link>
          <Link to="/trainers">Trainers</Link>
          <Link to="/bookings">My bookings</Link>
        </nav>
        <p className="site-footer-note">
          Payments processed securely by Stripe. &copy; {new Date().getFullYear()} Booking.
        </p>
      </div>
    </footer>
  );
}

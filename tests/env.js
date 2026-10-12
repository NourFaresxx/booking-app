// Loaded before the test framework and before any src module, so config read
// at require-time (rate limiters, TTLs, JWT secrets) sees these values.
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-different';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
process.env.PENDING_BOOKING_TTL_MINUTES = '15';
process.env.CLIENT_URL = '';

// The auth limiters are constructed at require-time and counted per IP, so a
// production-sized limit would start rejecting partway through the suite.
// The limiter's own behaviour is exercised in auth.test.js with its own app.
process.env.AUTH_RATE_LIMIT = '100000';
process.env.REFRESH_RATE_LIMIT = '100000';

// Leave SMTP unset: notificationService then logs instead of sending, so no
// test can accidentally reach a mail server.
delete process.env.SMTP_HOST;
delete process.env.MAIL_FROM;

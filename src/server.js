require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const connectDB = require('./config/db');
const maintenance = require('./jobs/bookingMaintenance');
const { setupGracefulShutdown } = require('./lifecycle');

const PORT = Number(process.env.PORT || 5000);

// Fail at boot rather than at the first request that needs one of these.
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

function checkEnvironment() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    console.error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ — sharing them lets a ' +
        'refresh token be used as an access token.'
    );
    process.exit(1);
  }

  for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) {
    if (!process.env[key]) {
      console.warn(`${key} is not set — payment endpoints will fail until it is.`);
    }
  }
}

async function main() {
  checkEnvironment();
  await connectDB(process.env.MONGODB_URI);

  // Index definitions live on the schemas; build them before serving so the
  // unique constraints that make the booking paths safe are actually in place.
  await mongoose.connection.syncIndexes().catch((err) => {
    console.warn(`Index sync skipped: ${err.message}`);
  });

  maintenance.start();

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    console.log(`API docs: http://localhost:${PORT}/api/docs`);
  });

  setupGracefulShutdown(server, { maintenance });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

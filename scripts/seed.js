// Populates a database with demo accounts and bookable resources so the API
// can be clicked through immediately.
//
// Usage: node scripts/seed.js [--reset]
//   --reset  delete existing users, resources, bookings and slot counters first
//
// Refuses to run against NODE_ENV=production.

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Resource, Booking, BookingSlot } = require('../src/models');

const PASSWORD = 'password123';

const ACCOUNTS = [
  { name: 'Ada Admin', email: 'admin@example.com', role: 'admin' },
  { name: 'Sam Staff', email: 'staff@example.com', role: 'staff' },
  { name: 'Casey Customer', email: 'customer@example.com', role: 'customer' },
];

const WEEKDAYS = [1, 2, 3, 4, 5];

const RESOURCES = [
  {
    name: 'Morning Yoga',
    description: 'A gentle 60-minute flow to start the day.',
    capacity: 12,
    price: 2500,
    durationMinutes: 60,
    timezone: 'Europe/Berlin',
    openingHours: WEEKDAYS.map((dayOfWeek) => ({ dayOfWeek, start: '07:00', end: '10:00' })),
  },
  {
    name: 'Meeting Room A',
    description: 'Eight-person room with a display and whiteboard.',
    capacity: 1,
    price: 4000,
    durationMinutes: 30,
    timezone: 'Europe/Berlin',
    openingHours: WEEKDAYS.map((dayOfWeek) => ({ dayOfWeek, start: '09:00', end: '18:00' })),
  },
  {
    name: 'Weekend Climbing Intro',
    description: 'Beginner session, equipment included.',
    capacity: 6,
    price: 3500,
    durationMinutes: 90,
    timezone: 'Europe/Berlin',
    openingHours: [
      { dayOfWeek: 6, start: '10:00', end: '16:00' },
      { dayOfWeek: 0, start: '10:00', end: '16:00' },
    ],
  },
  {
    name: 'Recording Booth',
    description: 'Treated booth, available around the clock.',
    capacity: 1,
    price: 1800,
    durationMinutes: 60,
    timezone: 'UTC',
    openingHours: [], // No windows means bookable at any hour.
  },
];

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed a production database.');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Copy .env.example to .env first.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to ${mongoose.connection.name}`);

  try {
    if (process.argv.includes('--reset')) {
      await Promise.all([
        User.deleteMany({}),
        Resource.deleteMany({}),
        Booking.deleteMany({}),
        BookingSlot.deleteMany({}),
      ]);
      console.log('Cleared existing data');
    }

    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    const users = {};

    for (const account of ACCOUNTS) {
      // Upsert so re-running the seed doesn't collide on the unique email.
      const user = await User.findOneAndUpdate(
        { email: account.email },
        { $set: { ...account }, $setOnInsert: { passwordHash } },
        { new: true, upsert: true }
      );
      users[account.role] = user;
      console.log(`  user  ${user.email.padEnd(24)} ${user.role}`);
    }

    for (const definition of RESOURCES) {
      const resource = await Resource.findOneAndUpdate(
        { name: definition.name },
        { $set: { ...definition, ownerId: users.staff._id, isActive: true } },
        { new: true, upsert: true }
      );
      const schedule =
        resource.openingHours.length === 0
          ? 'any time'
          : `${resource.openingHours.length} weekly window(s)`;
      console.log(
        `  room  ${resource.name.padEnd(24)} cap ${String(resource.capacity).padStart(2)}  ` +
          `${(resource.price / 100).toFixed(2)} ${resource.currency.toUpperCase()}  ${schedule}`
      );
    }

    console.log(`\nAll seeded accounts use the password: ${PASSWORD}`);
    console.log('Try: GET /api/resources, then GET /api/resources/<id>/availability');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

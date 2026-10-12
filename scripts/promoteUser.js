// One-off utility: change a user's role.
// Usage: node scripts/promoteUser.js <email> <role>
// Example: node scripts/promoteUser.js nour@test.com staff

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const ROLES = ['customer', 'staff', 'admin'];

async function main() {
  const [, , emailArg, role] = process.argv;

  if (!emailArg || !role) {
    console.error('Usage: node scripts/promoteUser.js <email> <role>');
    process.exit(1);
  }
  if (!ROLES.includes(role)) {
    console.error(`Role must be one of: ${ROLES.join(', ')}`);
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Copy .env.example to .env first.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    // Emails are stored lowercased, so match that way rather than failing to
    // find an account because of how it was typed here.
    const user = await User.findOneAndUpdate(
      { email: emailArg.toLowerCase().trim() },
      { role },
      { new: true }
    );

    if (!user) {
      console.error(`No user found with email: ${emailArg}`);
      process.exitCode = 1;
      return;
    }

    console.log(`Updated ${user.email} -> role: ${user.role}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

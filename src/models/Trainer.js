const mongoose = require('mongoose');

// A trainer's public profile — the thing a client reads to decide who to book
// with. Deliberately not a User: a trainer here is a staff-managed listing
// (bio, specialties, photo), not an account someone logs into. Linking it to
// a User would mean every trainer needs a login, which isn't true in general
// (a studio often lists trainers who never touch this system themselves).
const trainerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Short tagline under the name, e.g. "Certified Pilates Instructor".
    title: { type: String, default: '', trim: true },
    bio: { type: String, required: true, trim: true },
    specialties: { type: [String], default: [] },
    photoUrl: { type: String, default: null },
    yearsExperience: { type: Number, min: 0, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

trainerSchema.index({ name: 'text', bio: 'text', specialties: 'text' });
trainerSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('Trainer', trainerSchema);

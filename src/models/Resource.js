const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    capacity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 }, // in cents
    durationMinutes: { type: Number, required: true, min: 5 },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

resourceSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Resource', resourceSchema);

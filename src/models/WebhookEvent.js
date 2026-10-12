const mongoose = require('mongoose');

// Stripe guarantees at-least-once webhook delivery, so the same event can
// arrive more than once (retries after a timeout, or a replay from the
// dashboard). Recording event ids makes handling idempotent at the door,
// before any handler runs.
const webhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Stripe only retries for ~3 days; keeping these forever would grow without
// bound for no benefit.
webhookEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);

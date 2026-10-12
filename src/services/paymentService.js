const Stripe = require('stripe');

let stripe;
function getStripe() {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

async function createPaymentIntent({ amount, currency = 'usd', metadata, idempotencyKey }) {
  return getStripe().paymentIntents.create(
    {
      amount,
      currency,
      metadata,
      automatic_payment_methods: { enabled: true },
    },
    // Keyed on the booking so a retried request can't create a second charge.
    idempotencyKey ? { idempotencyKey } : undefined
  );
}

async function cancelPaymentIntent(paymentIntentId) {
  return getStripe().paymentIntents.cancel(paymentIntentId);
}

async function refundPaymentIntent({ paymentIntentId, idempotencyKey }) {
  return getStripe().refunds.create(
    { payment_intent: paymentIntentId },
    idempotencyKey ? { idempotencyKey } : undefined
  );
}

function constructWebhookEvent(rawBody, signature) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  }
  return getStripe().webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

module.exports = {
  createPaymentIntent,
  cancelPaymentIntent,
  refundPaymentIntent,
  constructWebhookEvent,
};

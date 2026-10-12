// Manual mock used by `jest.mock('../src/services/paymentService')`.
// Tests override single calls with mockResolvedValueOnce / mockRejectedValueOnce;
// `resetPaymentMocks()` restores the defaults, including clearing any leftover
// one-shot overrides (which mockClear alone would not).

let intentCounter = 0;
let refundCounter = 0;

const defaults = {
  async createPaymentIntent({ amount, currency = 'usd', metadata }) {
    intentCounter += 1;
    return {
      id: `pi_test_${intentCounter}`,
      client_secret: `pi_test_${intentCounter}_secret`,
      amount,
      currency,
      metadata,
      status: 'requires_payment_method',
    };
  },

  async cancelPaymentIntent(paymentIntentId) {
    return { id: paymentIntentId, status: 'canceled' };
  },

  async refundPaymentIntent({ paymentIntentId }) {
    refundCounter += 1;
    return {
      id: `re_test_${refundCounter}`,
      payment_intent: paymentIntentId,
      status: 'succeeded',
    };
  },

  // Signature verification can't be exercised without Stripe's signing secret,
  // so the mock treats the raw body as the already-serialised event and fails
  // on a body explicitly marked as badly signed.
  constructWebhookEvent(rawBody) {
    const event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody);
    if (event.__invalidSignature) {
      throw new Error('No signatures found matching the expected signature');
    }
    return event;
  },
};

const createPaymentIntent = jest.fn(defaults.createPaymentIntent);
const cancelPaymentIntent = jest.fn(defaults.cancelPaymentIntent);
const refundPaymentIntent = jest.fn(defaults.refundPaymentIntent);
const constructWebhookEvent = jest.fn(defaults.constructWebhookEvent);

const mocked = { createPaymentIntent, cancelPaymentIntent, refundPaymentIntent, constructWebhookEvent };

function resetPaymentMocks() {
  intentCounter = 0;
  refundCounter = 0;
  for (const [name, fn] of Object.entries(mocked)) {
    fn.mockReset();
    fn.mockImplementation(defaults[name]);
  }
}

module.exports = { ...mocked, resetPaymentMocks };

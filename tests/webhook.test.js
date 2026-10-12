jest.mock('../src/services/paymentService');
jest.mock('../src/services/notificationService');

const { app, request, makeUser, makeResource, as, futureSlot } = require('./helpers');
const Booking = require('../src/models/Booking');
const BookingSlot = require('../src/models/BookingSlot');
const WebhookEvent = require('../src/models/WebhookEvent');
const payments = require('../src/services/paymentService');
const notifications = require('../src/services/notificationService');

beforeEach(() => {
  payments.resetPaymentMocks();
  notifications.resetNotifications();
});

let eventCounter = 0;

/** A Stripe-shaped event. The mocked verifier reads the raw body as the event. */
function paymentIntentEvent(type, intent, { eventId } = {}) {
  eventCounter += 1;
  return {
    id: eventId || `evt_test_${eventCounter}`,
    type,
    data: { object: { object: 'payment_intent', ...intent } },
  };
}

/** Posts a raw body to the webhook, the way Stripe does. */
function postWebhook(event) {
  return request(app)
    .post('/api/webhooks/stripe')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', 't=1,v1=fake')
    .send(JSON.stringify(event));
}

/** Creates a pending booking and returns it with its intent id and slot start. */
async function pendingBooking({ capacity = 2, price = 2500 } = {}) {
  const resource = await makeResource({ capacity, price });
  const customer = await makeUser();
  const slotStart = futureSlot();

  const res = await as(customer.token)
    .post('/api/bookings')
    .send({ resourceId: resource._id.toString(), slotStart: slotStart.toISOString() });

  expect(res.status).toBe(201);
  return {
    resource,
    customer,
    slotStart,
    booking: res.body.booking,
    intentId: res.body.booking.stripePaymentIntentId,
  };
}

function slotFor(resource, slotStart) {
  return BookingSlot.findOne({ resourceId: resource._id, slotStart });
}

describe('signature verification', () => {
  it('rejects an unverifiable body with 400 and changes nothing', async () => {
    const { booking } = await pendingBooking();

    const res = await postWebhook({
      __invalidSignature: true,
      id: 'evt_bad',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_x', metadata: { bookingId: booking._id } } },
    });

    // 400, not 500: a bad signature is never worth retrying.
    expect(res.status).toBe(400);
    expect((await Booking.findById(booking._id)).status).toBe('pending');
    expect(await WebhookEvent.countDocuments()).toBe(0);
  });
});

describe('payment_intent.succeeded', () => {
  it('confirms the booking, marks it paid and clears the deadline', async () => {
    const { booking, intentId } = await pendingBooking();

    const res = await postWebhook(
      paymentIntentEvent('payment_intent.succeeded', {
        id: intentId,
        metadata: { bookingId: booking._id },
      })
    );

    expect(res.status).toBe(200);
    const stored = await Booking.findById(booking._id);
    expect(stored.status).toBe('confirmed');
    expect(stored.paymentStatus).toBe('paid');
    expect(stored.expiresAt).toBeNull();
    expect(notifications.bookingConfirmed).toHaveBeenCalledTimes(1);
  });

  it('acknowledges a replayed event without acting twice', async () => {
    const { booking, intentId } = await pendingBooking();
    const event = paymentIntentEvent('payment_intent.succeeded', {
      id: intentId,
      metadata: { bookingId: booking._id },
    });

    await postWebhook(event).expect(200);
    const replay = await postWebhook(event);

    expect(replay.status).toBe(200);
    expect(replay.body.duplicate).toBe(true);
    // One confirmation email, not two.
    expect(notifications.bookingConfirmed).toHaveBeenCalledTimes(1);
  });

  it('refunds a payment that lands after the booking has already expired', async () => {
    const { booking, intentId, resource, slotStart } = await pendingBooking({ capacity: 1 });

    // The seat has already been released and could have been resold, so this
    // payment cannot be honoured — the money has to go back.
    await Booking.findByIdAndUpdate(booking._id, { status: 'expired', expiresAt: null });

    const res = await postWebhook(
      paymentIntentEvent('payment_intent.succeeded', {
        id: intentId,
        metadata: { bookingId: booking._id },
      })
    );

    expect(res.status).toBe(200);
    expect(payments.refundPaymentIntent).toHaveBeenCalledTimes(1);

    const stored = await Booking.findById(booking._id);
    expect(stored.status).toBe('expired');
    expect(stored.paymentStatus).toBe('refunded');
    expect(stored.stripeRefundId).toBeTruthy();
    // The expired booking must not have quietly taken its seat back.
    expect((await slotFor(resource, slotStart)).bookedCount).toBe(1);
  });

  it('retries rather than swallowing a failed refund of a late payment', async () => {
    const { booking, intentId } = await pendingBooking();
    await Booking.findByIdAndUpdate(booking._id, { status: 'expired' });
    payments.refundPaymentIntent.mockRejectedValueOnce(new Error('Stripe unavailable'));

    const res = await postWebhook(
      paymentIntentEvent('payment_intent.succeeded', {
        id: intentId,
        metadata: { bookingId: booking._id },
      })
    );

    // Money is owed, so this must be a retryable failure, not a silent 200.
    expect(res.status).toBe(500);
    expect(await WebhookEvent.countDocuments()).toBe(0);
  });
});

describe('payment_intent.payment_failed', () => {
  it('cancels the booking AND releases the seat', async () => {
    const { booking, intentId, resource, slotStart } = await pendingBooking({ capacity: 1 });

    expect((await slotFor(resource, slotStart)).bookedCount).toBe(1);

    const res = await postWebhook(
      paymentIntentEvent('payment_intent.payment_failed', {
        id: intentId,
        metadata: { bookingId: booking._id },
      })
    );

    expect(res.status).toBe(200);
    expect((await Booking.findById(booking._id)).status).toBe('cancelled');
    // The seat is the whole point: cancelling without releasing it removes
    // capacity from the slot permanently.
    expect((await slotFor(resource, slotStart)).bookedCount).toBe(0);
  });

  it('lets the freed seat be booked by someone else', async () => {
    const { booking, intentId, resource, slotStart } = await pendingBooking({ capacity: 1 });
    const next = await makeUser();
    const body = { resourceId: resource._id.toString(), slotStart: slotStart.toISOString() };

    await as(next.token).post('/api/bookings').send(body).expect(409);

    await postWebhook(
      paymentIntentEvent('payment_intent.payment_failed', {
        id: intentId,
        metadata: { bookingId: booking._id },
      })
    ).expect(200);

    await as(next.token).post('/api/bookings').send(body).expect(201);
  });

  it('does not release a second seat when the event is redelivered', async () => {
    const { booking, intentId, resource, slotStart } = await pendingBooking({ capacity: 2 });
    const other = await makeUser();

    // A second, unrelated booking in the same slot.
    await as(other.token)
      .post('/api/bookings')
      .send({ resourceId: resource._id.toString(), slotStart: slotStart.toISOString() })
      .expect(201);
    expect((await slotFor(resource, slotStart)).bookedCount).toBe(2);

    const failure = paymentIntentEvent('payment_intent.payment_failed', {
      id: intentId,
      metadata: { bookingId: booking._id },
    });

    await postWebhook(failure).expect(200);
    await postWebhook(failure).expect(200);
    // Redelivery under a fresh event id bypasses the dedupe table, so the
    // conditional status transition has to carry the guarantee on its own.
    await postWebhook({ ...failure, id: 'evt_redelivered' }).expect(200);

    expect((await slotFor(resource, slotStart)).bookedCount).toBe(1);
  });

  it('handles payment_intent.canceled the same way', async () => {
    const { booking, intentId, resource, slotStart } = await pendingBooking({ capacity: 1 });

    await postWebhook(
      paymentIntentEvent('payment_intent.canceled', {
        id: intentId,
        metadata: { bookingId: booking._id },
      })
    ).expect(200);

    const stored = await Booking.findById(booking._id);
    expect(stored.status).toBe('cancelled');
    expect(stored.cancelReason).toBe('payment_intent_canceled');
    expect((await slotFor(resource, slotStart)).bookedCount).toBe(0);
  });

  it('leaves an already-confirmed booking confirmed', async () => {
    const { booking, intentId, resource, slotStart } = await pendingBooking({ capacity: 1 });
    await Booking.findByIdAndUpdate(booking._id, { status: 'confirmed', paymentStatus: 'paid' });

    await postWebhook(
      paymentIntentEvent('payment_intent.payment_failed', {
        id: intentId,
        metadata: { bookingId: booking._id },
      })
    ).expect(200);

    expect((await Booking.findById(booking._id)).status).toBe('confirmed');
    expect((await slotFor(resource, slotStart)).bookedCount).toBe(1);
  });
});

describe('charge.refunded', () => {
  it('cancels and releases the seat for a refund issued outside the API', async () => {
    const { booking, intentId, resource, slotStart } = await pendingBooking({ capacity: 1 });
    await Booking.findByIdAndUpdate(booking._id, {
      status: 'confirmed',
      paymentStatus: 'paid',
      expiresAt: null,
    });

    const res = await postWebhook({
      id: 'evt_charge_refund',
      type: 'charge.refunded',
      data: { object: { object: 'charge', id: 'ch_test_1', payment_intent: intentId } },
    });

    expect(res.status).toBe(200);
    const stored = await Booking.findById(booking._id);
    expect(stored.paymentStatus).toBe('refunded');
    expect(stored.status).toBe('cancelled');
    expect(stored.cancelReason).toBe('refunded');
    expect((await slotFor(resource, slotStart)).bookedCount).toBe(0);
  });

  it('ignores a refund for a booking that was never paid', async () => {
    const { booking, intentId, resource, slotStart } = await pendingBooking({ capacity: 1 });

    await postWebhook({
      id: 'evt_charge_refund_unpaid',
      type: 'charge.refunded',
      data: { object: { object: 'charge', payment_intent: intentId } },
    }).expect(200);

    expect((await Booking.findById(booking._id)).status).toBe('pending');
    expect((await slotFor(resource, slotStart)).bookedCount).toBe(1);
  });
});

describe('other events', () => {
  it('acknowledges an event type it does not handle', async () => {
    const res = await postWebhook({
      id: 'evt_unhandled',
      type: 'customer.subscription.updated',
      data: { object: {} },
    });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it('acknowledges an intent with no bookingId instead of failing', async () => {
    const res = await postWebhook(
      paymentIntentEvent('payment_intent.succeeded', { id: 'pi_unknown', metadata: {} })
    );
    expect(res.status).toBe(200);
  });

  it('500s and drops its dedupe claim so a retry really retries', async () => {
    const { booking, intentId } = await pendingBooking();
    notifications.bookingConfirmed.mockRejectedValueOnce(new Error('mail blew up'));

    const event = paymentIntentEvent('payment_intent.succeeded', {
      id: intentId,
      metadata: { bookingId: booking._id },
    });

    const failed = await postWebhook(event);
    expect(failed.status).toBe(500);
    // Keeping the claim would make Stripe's retry a no-op "duplicate".
    expect(await WebhookEvent.countDocuments({ eventId: event.id })).toBe(0);

    const retry = await postWebhook(event);
    expect(retry.status).toBe(200);
    expect(retry.body.duplicate).toBeUndefined();
  });
});

jest.mock('../src/services/paymentService');
jest.mock('../src/services/notificationService');

const { makeUser, makeResource, as, futureSlot } = require('./helpers');
const Booking = require('../src/models/Booking');
const BookingSlot = require('../src/models/BookingSlot');
const payments = require('../src/services/paymentService');
const notifications = require('../src/services/notificationService');
const maintenance = require('../src/jobs/bookingMaintenance');

beforeEach(() => {
  payments.resetPaymentMocks();
  notifications.resetNotifications();
});

async function book(token, resource, slotStart) {
  return as(token)
    .post('/api/bookings')
    .send({ resourceId: resource._id.toString(), slotStart: slotStart.toISOString() });
}

describe('POST /api/bookings', () => {
  it('creates a pending booking with a payment deadline and a client secret', async () => {
    const resource = await makeResource({ capacity: 2, price: 2500 });
    const customer = await makeUser();
    const slotStart = futureSlot();

    const res = await book(customer.token, resource, slotStart);

    expect(res.status).toBe(201);
    expect(res.body.booking).toMatchObject({
      status: 'pending',
      paymentStatus: 'unpaid',
      amount: 2500,
      currency: 'usd',
    });
    expect(res.body.clientSecret).toBeTruthy();
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('copies the price onto the booking so later price changes do not rewrite it', async () => {
    const resource = await makeResource({ price: 2500 });
    const customer = await makeUser();

    const res = await book(customer.token, resource, futureSlot());
    resource.price = 9999;
    await resource.save();

    const stored = await Booking.findById(res.body.booking._id);
    expect(stored.amount).toBe(2500);
  });

  it('rejects a slot in the past', async () => {
    const resource = await makeResource();
    const customer = await makeUser();

    const res = await book(customer.token, resource, new Date(Date.now() - 3600_000));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/future/);
  });

  it('rejects a slot start that is not on the resource schedule', async () => {
    const resource = await makeResource({
      durationMinutes: 60,
      openingHours: [{ dayOfWeek: 1, start: '09:00', end: '12:00' }],
    });
    const customer = await makeUser();

    // A Wednesday, when this resource has no window at all.
    const wednesday = futureSlot({ days: 2 });
    while (wednesday.getUTCDay() !== 3) wednesday.setUTCDate(wednesday.getUTCDate() + 1);

    const res = await book(customer.token, resource, wednesday);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not an available slot/);
  });

  it('refuses the same user booking the same slot twice', async () => {
    const resource = await makeResource({ capacity: 5 });
    const customer = await makeUser();
    const slotStart = futureSlot();

    await book(customer.token, resource, slotStart).then((r) => expect(r.status).toBe(201));
    const second = await book(customer.token, resource, slotStart);

    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/already have a booking/);
    // And the duplicate attempt must not have consumed a second seat.
    const slot = await BookingSlot.findOne({ resourceId: resource._id, slotStart });
    expect(slot.bookedCount).toBe(1);
  });

  it('404s for an inactive resource', async () => {
    const resource = await makeResource({ isActive: false });
    const customer = await makeUser();

    const res = await book(customer.token, resource, futureSlot());
    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    const { request, app } = require('./helpers');
    const res = await request(app).post('/api/bookings').send({});
    expect(res.status).toBe(401);
  });

  it('releases the seat when the payment provider cannot start a payment', async () => {
    const resource = await makeResource({ capacity: 1 });
    const customer = await makeUser();
    const slotStart = futureSlot();

    payments.createPaymentIntent.mockRejectedValueOnce(new Error('Stripe is down'));

    const res = await book(customer.token, resource, slotStart);
    expect(res.status).toBe(502);

    // The committed transaction must be compensated, or this seat is lost
    // forever to a booking that can never be paid.
    const slot = await BookingSlot.findOne({ resourceId: resource._id, slotStart });
    expect(slot.bookedCount).toBe(0);

    const booking = await Booking.findOne({ resourceId: resource._id });
    expect(booking.status).toBe('cancelled');
    expect(booking.cancelReason).toBe('payment_setup_failed');

    // And the freed seat is genuinely usable again.
    const other = await makeUser();
    await book(other.token, resource, slotStart).then((r) => expect(r.status).toBe(201));
  });

  it('keys the payment intent on the booking so a retry cannot double-charge', async () => {
    const resource = await makeResource();
    const customer = await makeUser();

    const res = await book(customer.token, resource, futureSlot());

    expect(payments.createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `booking_${res.body.booking._id}` })
    );
  });
});

describe('GET /api/bookings', () => {
  it('lists only your own bookings on /me', async () => {
    const resource = await makeResource({ capacity: 5 });
    const mine = await makeUser();
    const theirs = await makeUser();

    await book(mine.token, resource, futureSlot({ hourUtc: 10 }));
    await book(theirs.token, resource, futureSlot({ hourUtc: 11 }));

    const res = await as(mine.token).get('/api/bookings/me');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].userId).toBe(mine.user._id.toString());
  });

  it('filters /me by status', async () => {
    const resource = await makeResource({ capacity: 5 });
    const customer = await makeUser();
    const created = await book(customer.token, resource, futureSlot());
    await as(customer.token).patch(`/api/bookings/${created.body.booking._id}/cancel`);

    expect((await as(customer.token).get('/api/bookings/me?status=pending')).body.items).toHaveLength(0);
    expect((await as(customer.token).get('/api/bookings/me?status=cancelled')).body.items).toHaveLength(1);
  });

  it('refuses a customer on the staff-wide listing', async () => {
    const customer = await makeUser();
    expect((await as(customer.token).get('/api/bookings')).status).toBe(403);
  });

  it('lets staff list everything', async () => {
    const resource = await makeResource({ capacity: 5 });
    const customer = await makeUser();
    const staff = await makeUser({ role: 'staff' });
    await book(customer.token, resource, futureSlot());

    const res = await as(staff.token).get('/api/bookings');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].userId).toMatchObject({ email: customer.email });
  });

  it('lets the owner fetch one booking but not a stranger', async () => {
    const resource = await makeResource({ capacity: 5 });
    const owner = await makeUser();
    const stranger = await makeUser();
    const created = await book(owner.token, resource, futureSlot());
    const id = created.body.booking._id;

    expect((await as(owner.token).get(`/api/bookings/${id}`)).status).toBe(200);
    expect((await as(stranger.token).get(`/api/bookings/${id}`)).status).toBe(403);
  });
});

describe('PATCH /api/bookings/:id/cancel', () => {
  it('releases the seat and notifies the customer', async () => {
    const resource = await makeResource({ capacity: 2 });
    const customer = await makeUser();
    const slotStart = futureSlot();
    const created = await book(customer.token, resource, slotStart);

    const res = await as(customer.token).patch(`/api/bookings/${created.body.booking._id}/cancel`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect((await BookingSlot.findOne({ resourceId: resource._id, slotStart })).bookedCount).toBe(0);
    expect(notifications.bookingCancelled).toHaveBeenCalledTimes(1);
  });

  it('voids the uncaptured payment intent', async () => {
    const resource = await makeResource({ capacity: 2 });
    const customer = await makeUser();
    const created = await book(customer.token, resource, futureSlot());

    await as(customer.token).patch(`/api/bookings/${created.body.booking._id}/cancel`);

    expect(payments.cancelPaymentIntent).toHaveBeenCalledWith(
      created.body.booking.stripePaymentIntentId
    );
    expect(payments.refundPaymentIntent).not.toHaveBeenCalled();
  });

  it('refunds a paid booking', async () => {
    const resource = await makeResource({ capacity: 2, price: 4200 });
    const customer = await makeUser();
    const created = await book(customer.token, resource, futureSlot());
    const id = created.body.booking._id;

    // Simulate the payment having been confirmed by webhook.
    await Booking.findByIdAndUpdate(id, {
      status: 'confirmed',
      paymentStatus: 'paid',
      expiresAt: null,
    });

    const res = await as(customer.token).patch(`/api/bookings/${id}/cancel`);

    expect(res.status).toBe(200);
    expect(payments.refundPaymentIntent).toHaveBeenCalledTimes(1);
    expect((await Booking.findById(id)).paymentStatus).toBe('refunded');
    expect(notifications.bookingCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ refunded: true })
    );
  });

  it('still cancels when the refund call fails', async () => {
    const resource = await makeResource({ capacity: 2 });
    const customer = await makeUser();
    const created = await book(customer.token, resource, futureSlot());
    const id = created.body.booking._id;
    await Booking.findByIdAndUpdate(id, { status: 'confirmed', paymentStatus: 'paid' });

    payments.refundPaymentIntent.mockRejectedValueOnce(new Error('Stripe refund unavailable'));

    // The cancellation has already committed; reporting a 500 here would tell
    // the caller their cancelled booking is still live.
    const res = await as(customer.token).patch(`/api/bookings/${id}/cancel`);
    expect(res.status).toBe(200);
    expect((await Booking.findById(id)).status).toBe('cancelled');
  });

  it('is idempotent and releases only one seat', async () => {
    const resource = await makeResource({ capacity: 3 });
    const customer = await makeUser();
    const slotStart = futureSlot();
    const created = await book(customer.token, resource, slotStart);
    const id = created.body.booking._id;

    await as(customer.token).patch(`/api/bookings/${id}/cancel`).expect(200);
    await as(customer.token).patch(`/api/bookings/${id}/cancel`).expect(200);
    await as(customer.token).patch(`/api/bookings/${id}/cancel`).expect(200);

    expect((await BookingSlot.findOne({ resourceId: resource._id, slotStart })).bookedCount).toBe(0);
  });

  it("refuses a stranger cancelling someone else's booking", async () => {
    const resource = await makeResource({ capacity: 2 });
    const customer = await makeUser();
    const stranger = await makeUser();
    const created = await book(customer.token, resource, futureSlot());

    const res = await as(stranger.token).patch(
      `/api/bookings/${created.body.booking._id}/cancel`
    );
    expect(res.status).toBe(403);
    expect((await Booking.findById(created.body.booking._id)).status).toBe('pending');
  });

  it('lets staff cancel on a customer behalf and records why', async () => {
    const resource = await makeResource({ capacity: 2 });
    const customer = await makeUser();
    const staff = await makeUser({ role: 'staff' });
    const created = await book(customer.token, resource, futureSlot());

    const res = await as(staff.token).patch(`/api/bookings/${created.body.booking._id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.cancelReason).toBe('staff_cancelled');
  });

  it('stops a customer cancelling a slot that has already started, but not staff', async () => {
    const resource = await makeResource({ capacity: 2 });
    const customer = await makeUser();
    const staff = await makeUser({ role: 'staff' });
    const created = await book(customer.token, resource, futureSlot());
    const id = created.body.booking._id;

    // Move the slot into the past, as if the session has begun.
    await Booking.findByIdAndUpdate(id, {
      slotStart: new Date(Date.now() - 3600_000),
      slotEnd: new Date(Date.now() - 1800_000),
    });

    expect((await as(customer.token).patch(`/api/bookings/${id}/cancel`)).status).toBe(409);
    expect((await as(staff.token).patch(`/api/bookings/${id}/cancel`)).status).toBe(200);
  });

  it('404s for an unknown or malformed id', async () => {
    const customer = await makeUser();
    expect((await as(customer.token).patch('/api/bookings/nope/cancel')).status).toBe(404);
    expect(
      (await as(customer.token).patch('/api/bookings/66f1a2b3c4d5e6f708192a3b/cancel')).status
    ).toBe(404);
  });
});

describe('expiry sweeper', () => {
  it('releases the seat held by an abandoned checkout', async () => {
    const resource = await makeResource({ capacity: 1 });
    const customer = await makeUser();
    const slotStart = futureSlot();
    const created = await book(customer.token, resource, slotStart);
    const id = created.body.booking._id;

    // Without the sweeper this seat stays held forever and the slot is
    // permanently one short.
    await Booking.findByIdAndUpdate(id, { expiresAt: new Date(Date.now() - 1000) });

    const result = await maintenance.expirePendingBookings();

    expect(result.expired).toBe(1);
    expect((await Booking.findById(id)).status).toBe('expired');
    expect((await BookingSlot.findOne({ resourceId: resource._id, slotStart })).bookedCount).toBe(0);
    expect(notifications.bookingExpired).toHaveBeenCalledTimes(1);
  });

  it('voids the abandoned payment intent', async () => {
    const resource = await makeResource({ capacity: 1 });
    const customer = await makeUser();
    const created = await book(customer.token, resource, futureSlot());
    await Booking.findByIdAndUpdate(created.body.booking._id, {
      expiresAt: new Date(Date.now() - 1000),
    });

    await maintenance.expirePendingBookings();

    expect(payments.cancelPaymentIntent).toHaveBeenCalledWith(
      created.body.booking.stripePaymentIntentId
    );
  });

  it('leaves a booking whose deadline has not passed alone', async () => {
    const resource = await makeResource({ capacity: 1 });
    const customer = await makeUser();
    const created = await book(customer.token, resource, futureSlot());

    const result = await maintenance.expirePendingBookings();

    expect(result.expired).toBe(0);
    expect((await Booking.findById(created.body.booking._id)).status).toBe('pending');
  });

  it('never expires a booking that has been confirmed', async () => {
    const resource = await makeResource({ capacity: 1 });
    const customer = await makeUser();
    const created = await book(customer.token, resource, futureSlot());

    // Confirmed, but with a stale deadline still on the record.
    await Booking.findByIdAndUpdate(created.body.booking._id, {
      status: 'confirmed',
      paymentStatus: 'paid',
      expiresAt: new Date(Date.now() - 1000),
    });

    await maintenance.expirePendingBookings();

    const booking = await Booking.findById(created.body.booking._id);
    expect(booking.status).toBe('confirmed');
  });

  it('frees the seat for the next customer', async () => {
    const resource = await makeResource({ capacity: 1 });
    const first = await makeUser();
    const second = await makeUser();
    const slotStart = futureSlot();

    const created = await book(first.token, resource, slotStart);
    await book(second.token, resource, slotStart).then((r) => expect(r.status).toBe(409));

    await Booking.findByIdAndUpdate(created.body.booking._id, {
      expiresAt: new Date(Date.now() - 1000),
    });
    await maintenance.expirePendingBookings();

    await book(second.token, resource, slotStart).then((r) => expect(r.status).toBe(201));
  });

  it('marks finished bookings completed', async () => {
    const resource = await makeResource({ capacity: 2 });
    const customer = await makeUser();
    const created = await book(customer.token, resource, futureSlot());
    const id = created.body.booking._id;

    await Booking.findByIdAndUpdate(id, {
      status: 'confirmed',
      paymentStatus: 'paid',
      slotStart: new Date(Date.now() - 7200_000),
      slotEnd: new Date(Date.now() - 3600_000),
    });

    const result = await maintenance.completePastBookings();

    expect(result.completed).toBe(1);
    expect((await Booking.findById(id)).status).toBe('completed');
  });

  it('leaves a future confirmed booking as confirmed', async () => {
    const resource = await makeResource({ capacity: 2 });
    const customer = await makeUser();
    const created = await book(customer.token, resource, futureSlot());
    await Booking.findByIdAndUpdate(created.body.booking._id, { status: 'confirmed' });

    await maintenance.completePastBookings();

    expect((await Booking.findById(created.body.booking._id)).status).toBe('confirmed');
  });
});

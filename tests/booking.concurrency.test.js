jest.mock('../src/services/paymentService');
jest.mock('../src/services/notificationService');

const { makeUser, makeResource, as, futureSlot } = require('./helpers');
const Booking = require('../src/models/Booking');
const BookingSlot = require('../src/models/BookingSlot');
const { resetPaymentMocks } = require('../src/services/paymentService');
const { resetNotifications } = require('../src/services/notificationService');

beforeEach(() => {
  resetPaymentMocks();
  resetNotifications();
});

/** Fires one booking request per customer, all for the same slot, at once. */
function bookConcurrently(customers, resourceId, slotStart) {
  return Promise.all(
    customers.map(({ token }) =>
      as(token)
        .post('/api/bookings')
        .send({ resourceId: resourceId.toString(), slotStart: slotStart.toISOString() })
    )
  );
}

describe('concurrent booking', () => {
  it('never exceeds capacity when requests arrive simultaneously', async () => {
    const resource = await makeResource({ capacity: 3, durationMinutes: 60 });
    const slotStart = futureSlot();
    const customers = await Promise.all(Array.from({ length: 8 }, () => makeUser()));

    const results = await bookConcurrently(customers, resource._id, slotStart);

    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(3);
    expect(statuses.filter((s) => s === 409)).toHaveLength(5);
    // Nothing should fail for any other reason.
    expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);

    const active = await Booking.countDocuments({
      resourceId: resource._id,
      status: { $in: Booking.ACTIVE_STATUSES },
    });
    expect(active).toBe(3);

    const slot = await BookingSlot.findOne({ resourceId: resource._id, slotStart });
    expect(slot.bookedCount).toBe(3);
  });

  it('holds for a capacity of one, where the race window is widest', async () => {
    const resource = await makeResource({ capacity: 1, durationMinutes: 30 });
    const slotStart = futureSlot({ days: 3 });
    const customers = await Promise.all(Array.from({ length: 10 }, () => makeUser()));

    const results = await bookConcurrently(customers, resource._id, slotStart);

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
  });

  it('keeps separate slots independent', async () => {
    const resource = await makeResource({ capacity: 1, durationMinutes: 60 });
    const firstSlot = futureSlot({ days: 4, hourUtc: 10 });
    const secondSlot = futureSlot({ days: 4, hourUtc: 11 });
    const [a, b] = await Promise.all([makeUser(), makeUser()]);

    const results = await Promise.all([
      as(a.token)
        .post('/api/bookings')
        .send({ resourceId: resource._id.toString(), slotStart: firstSlot.toISOString() }),
      as(b.token)
        .post('/api/bookings')
        .send({ resourceId: resource._id.toString(), slotStart: secondSlot.toISOString() }),
    ]);

    // A full 10:00 must not block 11:00.
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(await BookingSlot.countDocuments({ resourceId: resource._id })).toBe(2);
  });

  it('frees exactly one seat when concurrent cancels hit the same booking', async () => {
    const resource = await makeResource({ capacity: 2, durationMinutes: 60 });
    const slotStart = futureSlot({ days: 5 });
    const customer = await makeUser();

    const created = await as(customer.token)
      .post('/api/bookings')
      .send({ resourceId: resource._id.toString(), slotStart: slotStart.toISOString() })
      .expect(201);

    const bookingId = created.body.booking._id;

    // Five simultaneous cancels of one booking must not release five seats.
    const cancels = await Promise.all(
      Array.from({ length: 5 }, () => as(customer.token).patch(`/api/bookings/${bookingId}/cancel`))
    );
    expect(cancels.every((r) => r.status === 200)).toBe(true);

    const slot = await BookingSlot.findOne({ resourceId: resource._id, slotStart });
    expect(slot.bookedCount).toBe(0);
  });

  it('lets a cancelled seat be taken by someone else', async () => {
    const resource = await makeResource({ capacity: 1, durationMinutes: 60 });
    const slotStart = futureSlot({ days: 6 });
    const first = await makeUser();
    const second = await makeUser();
    const body = { resourceId: resource._id.toString(), slotStart: slotStart.toISOString() };

    const created = await as(first.token).post('/api/bookings').send(body).expect(201);
    await as(second.token).post('/api/bookings').send(body).expect(409);

    await as(first.token)
      .patch(`/api/bookings/${created.body.booking._id}/cancel`)
      .expect(200);

    await as(second.token).post('/api/bookings').send(body).expect(201);
  });
});

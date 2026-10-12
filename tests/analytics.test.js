jest.mock('../src/services/paymentService');
jest.mock('../src/services/notificationService');

const { makeUser, makeResource, as, futureSlot } = require('./helpers');
const Booking = require('../src/models/Booking');
const payments = require('../src/services/paymentService');
const notifications = require('../src/services/notificationService');

beforeEach(() => {
  payments.resetPaymentMocks();
  notifications.resetNotifications();
});

/** Books a slot and forces the resulting booking into a known final state. */
async function bookAs(customer, resource, slotStart, patch) {
  const res = await as(customer.token)
    .post('/api/bookings')
    .send({ resourceId: resource._id.toString(), slotStart: slotStart.toISOString() });
  expect(res.status).toBe(201);

  if (patch) await Booking.findByIdAndUpdate(res.body.booking._id, patch);
  return res.body.booking;
}

const PAID = { status: 'confirmed', paymentStatus: 'paid', expiresAt: null };

function wideRange() {
  return {
    from: new Date(Date.now() - 30 * 86400_000).toISOString(),
    to: new Date(Date.now() + 30 * 86400_000).toISOString(),
  };
}

describe('GET /api/analytics/overview', () => {
  it('requires staff or admin', async () => {
    const customer = await makeUser();
    expect((await as(customer.token).get('/api/analytics/overview')).status).toBe(403);
  });

  it('requires authentication', async () => {
    const { request, app } = require('./helpers');
    expect((await request(app).get('/api/analytics/overview')).status).toBe(401);
  });

  it('counts bookings by status and sums only paid revenue', async () => {
    const admin = await makeUser({ role: 'admin' });
    const resource = await makeResource({ capacity: 10, price: 2500 });
    const customers = await Promise.all([makeUser(), makeUser(), makeUser()]);

    await bookAs(customers[0], resource, futureSlot({ hourUtc: 9 }), PAID);
    await bookAs(customers[1], resource, futureSlot({ hourUtc: 10 }), PAID);
    // Pending: a seat is held but no money has been taken.
    await bookAs(customers[2], resource, futureSlot({ hourUtc: 11 }));

    const res = await as(admin.token).get('/api/analytics/overview').query(wideRange());

    expect(res.status).toBe(200);
    expect(res.body.totals.bookings).toBe(3);
    expect(res.body.totals.bookingsByStatus).toMatchObject({ confirmed: 2, pending: 1 });
    expect(res.body.totals.grossRevenue).toBe(5000);
    expect(res.body.totals.netRevenue).toBe(5000);
  });

  it('reports refunds separately so gross and net differ', async () => {
    const admin = await makeUser({ role: 'admin' });
    const resource = await makeResource({ capacity: 10, price: 4000 });
    const [a, b] = await Promise.all([makeUser(), makeUser()]);

    await bookAs(a, resource, futureSlot({ hourUtc: 9 }), PAID);
    await bookAs(b, resource, futureSlot({ hourUtc: 10 }), {
      status: 'cancelled',
      paymentStatus: 'refunded',
    });

    const res = await as(admin.token).get('/api/analytics/overview').query(wideRange());

    expect(res.body.totals.grossRevenue).toBe(4000);
    expect(res.body.totals.refundedRevenue).toBe(4000);
    expect(res.body.totals.netRevenue).toBe(0);
  });

  it('values revenue at the booked price, not the current one', async () => {
    const admin = await makeUser({ role: 'admin' });
    const resource = await makeResource({ capacity: 10, price: 1000 });
    const customer = await makeUser();

    await bookAs(customer, resource, futureSlot(), PAID);

    // A later price rise must not inflate past revenue.
    resource.price = 50_000;
    await resource.save();

    const res = await as(admin.token).get('/api/analytics/overview').query(wideRange());
    expect(res.body.totals.grossRevenue).toBe(1000);
  });

  it('ranks resources by revenue and names them', async () => {
    const admin = await makeUser({ role: 'admin' });
    const cheap = await makeResource({ name: 'Cheap Class', capacity: 10, price: 500 });
    const pricey = await makeResource({ name: 'Pricey Class', capacity: 10, price: 9000 });
    const [a, b] = await Promise.all([makeUser(), makeUser()]);

    await bookAs(a, cheap, futureSlot({ hourUtc: 9 }), PAID);
    await bookAs(b, pricey, futureSlot({ hourUtc: 10 }), PAID);

    const res = await as(admin.token).get('/api/analytics/overview').query(wideRange());

    expect(res.body.topResources.map((r) => r.name)).toEqual(['Pricey Class', 'Cheap Class']);
    expect(res.body.topResources[0]).toMatchObject({ revenue: 9000, bookings: 1 });
  });

  it('buckets by slot date', async () => {
    const admin = await makeUser({ role: 'admin' });
    const resource = await makeResource({ capacity: 10, price: 1000 });
    const [a, b] = await Promise.all([makeUser(), makeUser()]);

    const dayOne = futureSlot({ days: 2, hourUtc: 9 });
    const dayTwo = futureSlot({ days: 3, hourUtc: 9 });
    await bookAs(a, resource, dayOne, PAID);
    await bookAs(b, resource, dayTwo, PAID);

    const res = await as(admin.token).get('/api/analytics/overview').query(wideRange());

    expect(res.body.byDay).toHaveLength(2);
    expect(res.body.byDay[0]).toMatchObject({
      date: dayOne.toISOString().slice(0, 10),
      bookings: 1,
      revenue: 1000,
    });
  });

  it('reports seat utilisation', async () => {
    const admin = await makeUser({ role: 'admin' });
    const resource = await makeResource({ capacity: 4, price: 1000 });
    const [a, b] = await Promise.all([makeUser(), makeUser()]);
    const slotStart = futureSlot();

    await bookAs(a, resource, slotStart, PAID);
    await bookAs(b, resource, slotStart, PAID);

    const res = await as(admin.token).get('/api/analytics/overview').query(wideRange());

    expect(res.body.occupancy).toMatchObject({
      slotsWithDemand: 1,
      seatsOffered: 4,
      seatsTaken: 2,
      utilisation: 0.5,
    });
  });

  it('excludes bookings outside the range', async () => {
    const admin = await makeUser({ role: 'admin' });
    const resource = await makeResource({ capacity: 10, price: 1000 });
    const customer = await makeUser();

    await bookAs(customer, resource, futureSlot({ days: 20 }), PAID);

    const res = await as(admin.token)
      .get('/api/analytics/overview')
      .query({
        from: new Date(Date.now() - 86400_000).toISOString(),
        to: new Date(Date.now() + 86400_000).toISOString(),
      });

    expect(res.body.totals.bookings).toBe(0);
    expect(res.body.totals.grossRevenue).toBe(0);
  });

  it('scopes staff to their own resources', async () => {
    const mine = await makeUser({ role: 'staff' });
    const theirs = await makeUser({ role: 'staff' });
    const myResource = await makeResource({ ownerId: mine.user._id, capacity: 10, price: 1000 });
    const theirResource = await makeResource({
      ownerId: theirs.user._id,
      capacity: 10,
      price: 7000,
    });
    const [a, b] = await Promise.all([makeUser(), makeUser()]);

    await bookAs(a, myResource, futureSlot({ hourUtc: 9 }), PAID);
    await bookAs(b, theirResource, futureSlot({ hourUtc: 10 }), PAID);

    const res = await as(mine.token).get('/api/analytics/overview').query(wideRange());

    expect(res.body.totals.bookings).toBe(1);
    expect(res.body.totals.grossRevenue).toBe(1000);
    expect(res.body.topResources.map((r) => r.name)).toEqual([myResource.name]);
  });

  it('returns a zeroed summary for staff who own nothing', async () => {
    const staff = await makeUser({ role: 'staff' });
    const resource = await makeResource({ capacity: 10, price: 1000 });
    const customer = await makeUser();
    await bookAs(customer, resource, futureSlot(), PAID);

    const res = await as(staff.token).get('/api/analytics/overview').query(wideRange());

    expect(res.status).toBe(200);
    expect(res.body.totals.bookings).toBe(0);
    expect(res.body.topResources).toEqual([]);
    expect(res.body.occupancy.utilisation).toBe(0);
  });

  it('lets an admin see every owner', async () => {
    const admin = await makeUser({ role: 'admin' });
    const [staffA, staffB] = await Promise.all([
      makeUser({ role: 'staff' }),
      makeUser({ role: 'staff' }),
    ]);
    const resourceA = await makeResource({ ownerId: staffA.user._id, capacity: 10, price: 1000 });
    const resourceB = await makeResource({ ownerId: staffB.user._id, capacity: 10, price: 2000 });
    const [a, b] = await Promise.all([makeUser(), makeUser()]);

    await bookAs(a, resourceA, futureSlot({ hourUtc: 9 }), PAID);
    await bookAs(b, resourceB, futureSlot({ hourUtc: 10 }), PAID);

    const res = await as(admin.token).get('/api/analytics/overview').query(wideRange());
    expect(res.body.totals.bookings).toBe(2);
    expect(res.body.totals.grossRevenue).toBe(3000);
  });

  it('rejects an inverted or oversized range', async () => {
    const admin = await makeUser({ role: 'admin' });

    const inverted = await as(admin.token).get('/api/analytics/overview').query({
      from: new Date().toISOString(),
      to: new Date(Date.now() - 1000).toISOString(),
    });
    expect(inverted.status).toBe(400);

    const tooLong = await as(admin.token).get('/api/analytics/overview').query({
      from: new Date(Date.now() - 500 * 86400_000).toISOString(),
      to: new Date().toISOString(),
    });
    expect(tooLong.status).toBe(400);
  });
});

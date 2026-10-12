jest.mock('../src/services/paymentService');
jest.mock('../src/services/notificationService');

const { app, request, makeUser, makeResource, as } = require('./helpers');
const {
  generateSlots,
  isBookableSlotStart,
} = require('../src/services/availabilityService');
const { resetPaymentMocks } = require('../src/services/paymentService');
const { resetNotifications } = require('../src/services/notificationService');

beforeEach(() => {
  resetPaymentMocks();
  resetNotifications();
});

/** The next UTC Monday at least `minDaysAhead` days out, at 00:00Z. */
function nextMondayUtc(minDaysAhead = 3) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + minDaysAhead);
  while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

describe('slot generation', () => {
  it('walks each opening window in duration-sized steps', () => {
    const resource = {
      durationMinutes: 60,
      timezone: 'UTC',
      openingHours: [{ dayOfWeek: 1, start: '09:00', end: '12:00' }],
    };

    const monday = nextMondayUtc();
    const slots = generateSlots(
      resource,
      monday,
      new Date(monday.getTime() + 24 * 60 * 60 * 1000)
    );

    expect(slots.map((s) => s.start.toISOString())).toEqual([
      new Date(monday.getTime() + 9 * 3600_000).toISOString(),
      new Date(monday.getTime() + 10 * 3600_000).toISOString(),
      new Date(monday.getTime() + 11 * 3600_000).toISOString(),
    ]);
  });

  it('does not emit a slot that would run past the end of a window', () => {
    const resource = {
      durationMinutes: 45,
      timezone: 'UTC',
      // 90 minutes fits exactly two 45-minute slots and no more.
      openingHours: [{ dayOfWeek: 1, start: '09:00', end: '10:30' }],
    };

    const monday = nextMondayUtc();
    const slots = generateSlots(
      resource,
      monday,
      new Date(monday.getTime() + 24 * 60 * 60 * 1000)
    );

    expect(slots).toHaveLength(2);
    expect(slots[1].end.getTime()).toBe(monday.getTime() + 10.5 * 3600_000);
  });

  it('keeps local opening hours fixed across a DST change', () => {
    const resource = {
      durationMinutes: 60,
      timezone: 'Europe/Berlin',
      openingHours: [{ dayOfWeek: 1, start: '09:00', end: '10:00' }],
    };

    // Berlin moves to summer time on 29 March 2026, between these Mondays.
    const slots = generateSlots(
      resource,
      new Date('2026-03-23T00:00:00.000Z'),
      new Date('2026-03-31T00:00:00.000Z')
    );

    // 09:00 local stays 09:00 local: 08:00Z under CET, 07:00Z under CEST.
    expect(slots.map((s) => s.start.toISOString())).toEqual([
      '2026-03-23T08:00:00.000Z',
      '2026-03-30T07:00:00.000Z',
    ]);
  });

  it('treats a resource with no opening hours as open around the clock', () => {
    const resource = { durationMinutes: 60, timezone: 'UTC', openingHours: [] };
    const day = nextMondayUtc();

    const slots = generateSlots(resource, day, new Date(day.getTime() + 24 * 3600_000));
    expect(slots).toHaveLength(24);
  });

  it('only accepts slot starts that line up with a generated slot', () => {
    const resource = {
      durationMinutes: 60,
      timezone: 'UTC',
      openingHours: [{ dayOfWeek: 1, start: '09:00', end: '12:00' }],
    };
    const monday = nextMondayUtc();

    expect(isBookableSlotStart(resource, new Date(monday.getTime() + 9 * 3600_000))).toBe(true);
    // Half past the hour is inside the window but not on a boundary.
    expect(isBookableSlotStart(resource, new Date(monday.getTime() + 9.5 * 3600_000))).toBe(false);
    // Outside the window entirely.
    expect(isBookableSlotStart(resource, new Date(monday.getTime() + 15 * 3600_000))).toBe(false);
    // Wrong day of the week.
    expect(isBookableSlotStart(resource, new Date(monday.getTime() + 33 * 3600_000))).toBe(false);
  });

  it('accepts any start time when no opening hours are configured', () => {
    const resource = { durationMinutes: 60, timezone: 'UTC', openingHours: [] };
    expect(isBookableSlotStart(resource, new Date('2027-01-01T03:17:00.000Z'))).toBe(true);
  });
});

describe('GET /api/resources/:id/availability', () => {
  it('is public and reports full capacity for an untouched slot', async () => {
    const monday = nextMondayUtc();
    const resource = await makeResource({
      capacity: 3,
      durationMinutes: 60,
      openingHours: [{ dayOfWeek: 1, start: '09:00', end: '11:00' }],
    });

    const res = await request(app)
      .get(`/api/resources/${resource._id}/availability`)
      .query({ from: monday.toISOString(), to: new Date(monday.getTime() + 86400_000).toISOString() });

    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(2);
    expect(res.body.slots[0]).toMatchObject({
      capacity: 3,
      booked: 0,
      remaining: 3,
      bookable: true,
    });
  });

  it('reflects seats already taken', async () => {
    const monday = nextMondayUtc();
    const slotStart = new Date(monday.getTime() + 9 * 3600_000);
    const resource = await makeResource({
      capacity: 2,
      durationMinutes: 60,
      openingHours: [{ dayOfWeek: 1, start: '09:00', end: '10:00' }],
    });
    const customer = await makeUser();

    await as(customer.token)
      .post('/api/bookings')
      .send({ resourceId: resource._id.toString(), slotStart: slotStart.toISOString() })
      .expect(201);

    const res = await request(app)
      .get(`/api/resources/${resource._id}/availability`)
      .query({ from: monday.toISOString(), to: new Date(monday.getTime() + 86400_000).toISOString() });

    expect(res.body.slots[0]).toMatchObject({ capacity: 2, booked: 1, remaining: 1, bookable: true });
  });

  it('marks a slot unbookable once it is full', async () => {
    const monday = nextMondayUtc();
    const slotStart = new Date(monday.getTime() + 9 * 3600_000);
    const resource = await makeResource({
      capacity: 1,
      durationMinutes: 60,
      openingHours: [{ dayOfWeek: 1, start: '09:00', end: '10:00' }],
    });
    const customer = await makeUser();

    await as(customer.token)
      .post('/api/bookings')
      .send({ resourceId: resource._id.toString(), slotStart: slotStart.toISOString() })
      .expect(201);

    const res = await request(app)
      .get(`/api/resources/${resource._id}/availability`)
      .query({ from: monday.toISOString(), to: new Date(monday.getTime() + 86400_000).toISOString() });

    expect(res.body.slots[0]).toMatchObject({ remaining: 0, bookable: false });
  });

  it('defaults to the next seven days', async () => {
    const resource = await makeResource({
      durationMinutes: 60,
      openingHours: [{ dayOfWeek: 0, start: '09:00', end: '10:00' },
                     { dayOfWeek: 1, start: '09:00', end: '10:00' },
                     { dayOfWeek: 2, start: '09:00', end: '10:00' },
                     { dayOfWeek: 3, start: '09:00', end: '10:00' },
                     { dayOfWeek: 4, start: '09:00', end: '10:00' },
                     { dayOfWeek: 5, start: '09:00', end: '10:00' },
                     { dayOfWeek: 6, start: '09:00', end: '10:00' }],
    });

    const res = await request(app).get(`/api/resources/${resource._id}/availability`);
    expect(res.status).toBe(200);
    // One slot a day over a 7-day window: 7 whole days are covered, but the
    // current day's 09:00 may already be behind us.
    expect(res.body.slots.length).toBeGreaterThanOrEqual(6);
    expect(res.body.slots.length).toBeLessThanOrEqual(8);
  });

  it('rejects an inverted range and one longer than the cap', async () => {
    const resource = await makeResource();
    const now = new Date();

    const inverted = await request(app)
      .get(`/api/resources/${resource._id}/availability`)
      .query({ from: now.toISOString(), to: new Date(now.getTime() - 1000).toISOString() });
    expect(inverted.status).toBe(400);

    const tooLong = await request(app)
      .get(`/api/resources/${resource._id}/availability`)
      .query({
        from: now.toISOString(),
        to: new Date(now.getTime() + 100 * 86400_000).toISOString(),
      });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toMatch(/cannot exceed/);
  });

  it('returns 400 for an unparseable date', async () => {
    const resource = await makeResource();
    const res = await request(app)
      .get(`/api/resources/${resource._id}/availability`)
      .query({ from: 'yesterday-ish' });
    expect(res.status).toBe(400);
  });
});

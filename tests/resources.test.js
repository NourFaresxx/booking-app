const { app, request, makeUser, makeResource, as } = require('./helpers');
const Resource = require('../src/models/Resource');

describe('GET /api/resources', () => {
  it('is public and hides deactivated resources', async () => {
    const { user } = await makeUser({ role: 'staff' });
    await makeResource({ ownerId: user._id, name: 'Visible Class' });
    await makeResource({ ownerId: user._id, name: 'Hidden Class', isActive: false });

    const res = await request(app).get('/api/resources');
    expect(res.status).toBe(200);
    expect(res.body.items.map((r) => r.name)).toEqual(['Visible Class']);
    expect(res.body.pagination).toMatchObject({ page: 1, total: 1, pages: 1 });
  });

  it('defaults new resources to the "class" category', async () => {
    const resource = await makeResource();
    expect(resource.category).toBe('class');
  });

  it('filters by category', async () => {
    const { user } = await makeUser({ role: 'staff' });
    await makeResource({ ownerId: user._id, name: 'Yoga', category: 'class' });
    await makeResource({ ownerId: user._id, name: 'Sauna', category: 'self-care' });

    const classes = await request(app).get('/api/resources?category=class');
    expect(classes.body.items.map((r) => r.name)).toEqual(['Yoga']);

    const selfCare = await request(app).get('/api/resources?category=self-care');
    expect(selfCare.body.items.map((r) => r.name)).toEqual(['Sauna']);
  });

  it('rejects an invalid category', async () => {
    const res = await request(app).get('/api/resources?category=bogus');
    expect(res.status).toBe(400);
  });

  it('ignores includeInactive for an anonymous caller', async () => {
    const { user } = await makeUser({ role: 'staff' });
    await makeResource({ ownerId: user._id, name: 'Hidden', isActive: false });

    const res = await request(app).get('/api/resources?includeInactive=true');
    expect(res.body.items).toHaveLength(0);
  });

  it('ignores includeInactive for a logged-in customer', async () => {
    const { user } = await makeUser({ role: 'staff' });
    const customer = await makeUser();
    await makeResource({ ownerId: user._id, name: 'Hidden', isActive: false });

    const res = await as(customer.token).get('/api/resources?includeInactive=true');
    expect(res.body.items).toHaveLength(0);
  });

  it('shows deactivated resources to staff when includeInactive=true', async () => {
    const staff = await makeUser({ role: 'staff' });
    await makeResource({ ownerId: staff.user._id, name: 'Visible' });
    await makeResource({ ownerId: staff.user._id, name: 'Hidden', isActive: false });

    const withoutFlag = await as(staff.token).get('/api/resources');
    expect(withoutFlag.body.items.map((r) => r.name)).toEqual(['Visible']);

    const withFlag = await as(staff.token).get('/api/resources?includeInactive=true');
    expect(withFlag.body.items.map((r) => r.name).sort()).toEqual(['Hidden', 'Visible']);
  });

  it('filters by price range in cents', async () => {
    const { user } = await makeUser({ role: 'staff' });
    await makeResource({ ownerId: user._id, name: 'Cheap', price: 500 });
    await makeResource({ ownerId: user._id, name: 'Mid', price: 2500 });
    await makeResource({ ownerId: user._id, name: 'Pricey', price: 9000 });

    const res = await request(app).get('/api/resources?minPrice=1000&maxPrice=5000');
    expect(res.body.items.map((r) => r.name)).toEqual(['Mid']);
  });

  it('paginates', async () => {
    const { user } = await makeUser({ role: 'staff' });
    for (let i = 0; i < 5; i += 1) {
      await makeResource({ ownerId: user._id, name: `Class ${i}` });
    }

    const res = await request(app).get('/api/resources?page=2&limit=2');
    expect(res.body.items).toHaveLength(2);
    expect(res.body.pagination).toMatchObject({ page: 2, limit: 2, total: 5, pages: 3 });
  });

  it('sorts by an allowed field', async () => {
    const { user } = await makeUser({ role: 'staff' });
    await makeResource({ ownerId: user._id, name: 'B', price: 300 });
    await makeResource({ ownerId: user._id, name: 'A', price: 100 });

    const res = await request(app).get('/api/resources?sort=price');
    expect(res.body.items.map((r) => r.price)).toEqual([100, 300]);
  });

  it('rejects a sort field that is not on the allow-list', async () => {
    const res = await request(app).get('/api/resources?sort=-passwordHash');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Cannot sort by/);
  });

  it('rejects a non-numeric price filter instead of silently ignoring it', async () => {
    const res = await request(app).get('/api/resources?minPrice=abc');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/resources/:id', () => {
  it('returns the resource', async () => {
    const resource = await makeResource();
    const res = await request(app).get(`/api/resources/${resource._id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Morning Yoga');
  });

  it('returns 404 for an id that is not a valid ObjectId', async () => {
    const res = await request(app).get('/api/resources/not-an-id');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/resources', () => {
  it('accepts an explicit category and defaults to "class" when omitted', async () => {
    const staff = await makeUser({ role: 'staff' });

    const withCategory = await as(staff.token)
      .post('/api/resources')
      .send({ name: 'Sauna', category: 'self-care', capacity: 8, price: 2000, durationMinutes: 45 });
    expect(withCategory.body.category).toBe('self-care');

    const withoutCategory = await as(staff.token)
      .post('/api/resources')
      .send({ name: 'Spin', capacity: 10, price: 2000, durationMinutes: 45 });
    expect(withoutCategory.body.category).toBe('class');
  });

  it('rejects an unknown category', async () => {
    const staff = await makeUser({ role: 'staff' });
    const res = await as(staff.token)
      .post('/api/resources')
      .send({ name: 'X', category: 'bogus', capacity: 1, price: 0, durationMinutes: 30 });
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/resources').send({ name: 'x' });
    expect(res.status).toBe(401);
  });

  it('records the creator as the owner', async () => {
    const staff = await makeUser({ role: 'staff' });

    const res = await as(staff.token)
      .post('/api/resources')
      .send({ name: 'Pilates', capacity: 8, price: 3000, durationMinutes: 50 });

    expect(res.status).toBe(201);
    expect(res.body.ownerId).toBe(staff.user._id.toString());
  });

  it('ignores a client-supplied ownerId', async () => {
    const staff = await makeUser({ role: 'staff' });
    const other = await makeUser({ role: 'staff' });

    const res = await as(staff.token).post('/api/resources').send({
      name: 'Hijack',
      capacity: 2,
      price: 100,
      durationMinutes: 30,
      ownerId: other.user._id.toString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.ownerId).toBe(staff.user._id.toString());
  });

  it('accepts recurring opening hours and a timezone', async () => {
    const staff = await makeUser({ role: 'staff' });

    const res = await as(staff.token)
      .post('/api/resources')
      .send({
        name: 'Berlin Yoga',
        capacity: 5,
        price: 2000,
        durationMinutes: 60,
        timezone: 'Europe/Berlin',
        openingHours: [{ dayOfWeek: 1, start: '09:00', end: '12:00' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.timezone).toBe('Europe/Berlin');
    expect(res.body.openingHours).toHaveLength(1);
  });

  it('rejects an unknown timezone', async () => {
    const staff = await makeUser({ role: 'staff' });

    const res = await as(staff.token).post('/api/resources').send({
      name: 'Nowhere',
      capacity: 5,
      price: 2000,
      durationMinutes: 60,
      timezone: 'Mars/Olympus_Mons',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown timezone/);
  });

  it('rejects an opening-hours window that does not move forward', async () => {
    const staff = await makeUser({ role: 'staff' });

    const res = await as(staff.token)
      .post('/api/resources')
      .send({
        name: 'Backwards',
        capacity: 5,
        price: 2000,
        durationMinutes: 60,
        openingHours: [{ dayOfWeek: 1, start: '17:00', end: '09:00' }],
      });

    expect(res.status).toBe(400);
  });

  it('rejects a negative price and a zero capacity', async () => {
    const staff = await makeUser({ role: 'staff' });

    const res = await as(staff.token)
      .post('/api/resources')
      .send({ name: 'Bad Numbers', capacity: 0, price: -100, durationMinutes: 60 });

    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.path).sort()).toEqual(['capacity', 'price']);
  });
});

describe('ownership on PATCH and DELETE', () => {
  it('lets staff update their own resource', async () => {
    const staff = await makeUser({ role: 'staff' });
    const resource = await makeResource({ ownerId: staff.user._id });

    const res = await as(staff.token)
      .patch(`/api/resources/${resource._id}`)
      .send({ price: 4000 });

    expect(res.status).toBe(200);
    expect(res.body.price).toBe(4000);
  });

  it("refuses staff editing another owner's resource", async () => {
    const owner = await makeUser({ role: 'staff' });
    const intruder = await makeUser({ role: 'staff' });
    const resource = await makeResource({ ownerId: owner.user._id });

    const res = await as(intruder.token)
      .patch(`/api/resources/${resource._id}`)
      .send({ price: 1 });

    expect(res.status).toBe(403);
    // And the change must not have landed.
    expect((await Resource.findById(resource._id)).price).toBe(2500);
  });

  it("refuses staff deactivating another owner's resource", async () => {
    const owner = await makeUser({ role: 'staff' });
    const intruder = await makeUser({ role: 'staff' });
    const resource = await makeResource({ ownerId: owner.user._id });

    expect((await as(intruder.token).delete(`/api/resources/${resource._id}`)).status).toBe(403);
    expect((await Resource.findById(resource._id)).isActive).toBe(true);
  });

  it('lets an admin edit and deactivate anything', async () => {
    const owner = await makeUser({ role: 'staff' });
    const admin = await makeUser({ role: 'admin' });
    const resource = await makeResource({ ownerId: owner.user._id });

    expect(
      (await as(admin.token).patch(`/api/resources/${resource._id}`).send({ price: 10 })).status
    ).toBe(200);
    expect((await as(admin.token).delete(`/api/resources/${resource._id}`)).status).toBe(204);
  });

  it('soft-deletes so booking history survives', async () => {
    const admin = await makeUser({ role: 'admin' });
    const resource = await makeResource();

    await as(admin.token).delete(`/api/resources/${resource._id}`);

    const stored = await Resource.findById(resource._id);
    expect(stored).not.toBeNull();
    expect(stored.isActive).toBe(false);
  });

  it('rejects an empty update body', async () => {
    const staff = await makeUser({ role: 'staff' });
    const resource = await makeResource({ ownerId: staff.user._id });

    const res = await as(staff.token).patch(`/api/resources/${resource._id}`).send({});
    expect(res.status).toBe(400);
  });
});

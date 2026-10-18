const { app, request, makeUser, makeResource, makeTrainer, as } = require('./helpers');
const Trainer = require('../src/models/Trainer');
const Resource = require('../src/models/Resource');

describe('GET /api/trainers', () => {
  it('is public and hides deactivated trainers', async () => {
    await makeTrainer({ name: 'Visible Trainer' });
    await makeTrainer({ name: 'Hidden Trainer', isActive: false });

    const res = await request(app).get('/api/trainers');
    expect(res.status).toBe(200);
    expect(res.body.items.map((t) => t.name)).toEqual(['Visible Trainer']);
  });

  it('searches across name, bio, and specialties', async () => {
    await makeTrainer({ name: 'Sarah Chen', specialties: ['Pilates'] });
    await makeTrainer({ name: 'Marcus Webb', specialties: ['CrossFit'] });

    const res = await request(app).get('/api/trainers?search=Pilates');
    expect(res.body.items.map((t) => t.name)).toEqual(['Sarah Chen']);
  });

  it('sorts alphabetically by name', async () => {
    await makeTrainer({ name: 'Zoe' });
    await makeTrainer({ name: 'Amir' });

    const res = await request(app).get('/api/trainers');
    expect(res.body.items.map((t) => t.name)).toEqual(['Amir', 'Zoe']);
  });

  it('paginates', async () => {
    for (let i = 0; i < 5; i += 1) await makeTrainer({ name: `Trainer ${i}` });

    const res = await request(app).get('/api/trainers?page=2&limit=2');
    expect(res.body.items).toHaveLength(2);
    expect(res.body.pagination).toMatchObject({ page: 2, limit: 2, total: 5, pages: 3 });
  });
});

describe('GET /api/trainers/:id', () => {
  it('returns the trainer plus their active classes', async () => {
    const trainer = await makeTrainer({ name: 'Sarah Chen' });
    const staff = await makeUser({ role: 'staff' });
    await makeResource({ ownerId: staff.user._id, name: 'Pilates A', trainerId: trainer._id });
    await makeResource({ ownerId: staff.user._id, name: 'Pilates B', trainerId: trainer._id });
    // A different trainer's class shouldn't show up here.
    const otherTrainer = await makeTrainer({ name: 'Marcus Webb' });
    await makeResource({ ownerId: staff.user._id, name: 'CrossFit', trainerId: otherTrainer._id });

    const res = await request(app).get(`/api/trainers/${trainer._id}`);

    expect(res.status).toBe(200);
    expect(res.body.trainer.name).toBe('Sarah Chen');
    expect(res.body.classes.map((c) => c.name).sort()).toEqual(['Pilates A', 'Pilates B']);
  });

  it('excludes a deactivated class from the trainer’s class list', async () => {
    const trainer = await makeTrainer();
    const staff = await makeUser({ role: 'staff' });
    await makeResource({ ownerId: staff.user._id, trainerId: trainer._id, isActive: false });

    const res = await request(app).get(`/api/trainers/${trainer._id}`);
    expect(res.body.classes).toHaveLength(0);
  });

  it('404s for an unknown or malformed id', async () => {
    expect((await request(app).get('/api/trainers/not-an-id')).status).toBe(404);
    expect(
      (await request(app).get('/api/trainers/66f1a2b3c4d5e6f708192a3b')).status
    ).toBe(404);
  });
});

describe('POST /api/trainers', () => {
  const validBody = {
    name: 'New Trainer',
    bio: 'A sufficiently long bio describing this trainer and their approach.',
    specialties: ['Yoga'],
  };

  it('requires authentication', async () => {
    const res = await request(app).post('/api/trainers').send(validBody);
    expect(res.status).toBe(401);
  });

  it('refuses a customer and allows staff', async () => {
    const customer = await makeUser({ role: 'customer' });
    const staff = await makeUser({ role: 'staff' });

    expect((await as(customer.token).post('/api/trainers').send(validBody)).status).toBe(403);

    const res = await as(staff.token).post('/api/trainers').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('New Trainer');
  });

  it('rejects a bio that is too short', async () => {
    const staff = await makeUser({ role: 'staff' });
    const res = await as(staff.token)
      .post('/api/trainers')
      .send({ name: 'X', bio: 'short' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/trainers/:id', () => {
  it('lets any staff edit any trainer (no ownership on trainers)', async () => {
    const trainer = await makeTrainer({ name: 'Original Name' });
    const staff = await makeUser({ role: 'staff' });

    const res = await as(staff.token)
      .patch(`/api/trainers/${trainer._id}`)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');
  });

  it('rejects an empty update body', async () => {
    const trainer = await makeTrainer();
    const staff = await makeUser({ role: 'staff' });

    const res = await as(staff.token).patch(`/api/trainers/${trainer._id}`).send({});
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/trainers/:id', () => {
  it('soft-deletes and leaves linked classes intact', async () => {
    const trainer = await makeTrainer();
    const staff = await makeUser({ role: 'staff' });
    const resource = await makeResource({ ownerId: staff.user._id, trainerId: trainer._id });

    const res = await as(staff.token).delete(`/api/trainers/${trainer._id}`);
    expect(res.status).toBe(204);

    const stored = await Trainer.findById(trainer._id);
    expect(stored.isActive).toBe(false);

    const storedResource = await Resource.findById(resource._id);
    expect(storedResource.trainerId.toString()).toBe(trainer._id.toString());
    expect(storedResource.isActive).toBe(true);
  });
});

describe('linking a resource to a trainer', () => {
  it('populates the trainer on list and detail views', async () => {
    const trainer = await makeTrainer({ name: 'Sarah Chen', title: 'Pilates Instructor' });
    const staff = await makeUser({ role: 'staff' });
    const resource = await makeResource({
      ownerId: staff.user._id,
      name: 'Pilates Fundamentals',
      trainerId: trainer._id,
    });

    const detail = await request(app).get(`/api/resources/${resource._id}`);
    expect(detail.body.trainerId).toMatchObject({ name: 'Sarah Chen', title: 'Pilates Instructor' });

    const list = await request(app).get('/api/resources');
    const found = list.body.items.find((r) => r._id === resource._id.toString());
    expect(found.trainerId.name).toBe('Sarah Chen');
  });

  it('rejects a trainerId that does not exist', async () => {
    const staff = await makeUser({ role: 'staff' });
    const res = await as(staff.token)
      .post('/api/resources')
      .send({
        name: 'Ghost Class',
        capacity: 5,
        price: 1000,
        durationMinutes: 45,
        trainerId: '66f1a2b3c4d5e6f708192a3b',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not refer to an existing trainer/);
  });

  it('allows creating and updating a resource with no trainer at all', async () => {
    const staff = await makeUser({ role: 'staff' });
    const res = await as(staff.token)
      .post('/api/resources')
      .send({ name: 'Meeting Room', capacity: 1, price: 1000, durationMinutes: 30 });

    expect(res.status).toBe(201);
    expect(res.body.trainerId).toBeNull();
  });

  it('lets a trainer be cleared from a resource', async () => {
    const trainer = await makeTrainer();
    const staff = await makeUser({ role: 'staff' });
    const resource = await makeResource({ ownerId: staff.user._id, trainerId: trainer._id });

    const res = await as(staff.token)
      .patch(`/api/resources/${resource._id}`)
      .send({ trainerId: null });

    expect(res.status).toBe(200);
    expect(res.body.trainerId).toBeNull();
  });
});

const { app, request, makeUser, as } = require('./helpers');
const User = require('../src/models/User');

describe('POST /api/auth/register', () => {
  it('creates an account and returns a token pair', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Nour Fares',
      email: 'nour@test.local',
      password: 'password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'nour@test.local', role: 'customer' });
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    // The hash must never leave the server.
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('stores the password hashed, not in the clear', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Hash Check', email: 'hash@test.local', password: 'password123' });

    const stored = await User.findOne({ email: 'hash@test.local' });
    expect(stored.passwordHash).not.toBe('password123');
    expect(await stored.comparePassword('password123')).toBe(true);
  });

  it('rejects a duplicate email with 409', async () => {
    const body = { name: 'First', email: 'dupe@test.local', password: 'password123' };
    await request(app).post('/api/auth/register').send(body);

    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(409);
  });

  it('lowercases the email so case cannot create a second account', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Lower', email: 'Mixed@Test.local', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Lower', email: 'mixed@test.local', password: 'password123' });

    expect(res.status).toBe(409);
  });

  it('reports every validation problem at once', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'x', email: 'not-an-email', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details.map((d) => d.path).sort()).toEqual(['email', 'name', 'password']);
  });

  it('cannot be used to self-assign a privileged role', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Sneaky',
      email: 'sneaky@test.local',
      password: 'password123',
      role: 'admin',
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('customer');
  });
});

describe('POST /api/auth/login', () => {
  it('returns tokens for correct credentials', async () => {
    const { email, password } = await makeUser();

    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const { email } = await makeUser();

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'not-the-password' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.local', password: 'password123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Distinguishable messages would confirm which emails have accounts.
    expect(wrongPassword.body.error).toBe(unknownEmail.body.error);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the authenticated user', async () => {
    const { token, email } = await makeUser();

    const res = await as(token).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
  });

  it('rejects a missing, malformed, or bogus token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', 'token abc')).status
    ).toBe(401);
    expect((await as('not-a-real-jwt').get('/api/auth/me')).status).toBe(401);
  });

  it('rejects a valid token for a deleted account', async () => {
    const { token, user } = await makeUser();
    await User.findByIdAndDelete(user._id);

    expect((await as(token).get('/api/auth/me')).status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the refresh token and invalidates the old one', async () => {
    const { email, password } = await makeUser();
    const login = await request(app).post('/api/auth/login').send({ email, password });

    const first = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });

    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(login.body.refreshToken);

    // Replaying the consumed token must fail — that limit on a leaked token's
    // usefulness is the entire point of rotation.
    const replay = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(replay.status).toBe(401);

    // The newly issued one still works.
    const second = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: first.body.refreshToken });
    expect(second.status).toBe(200);
  });

  it('rejects an access token used as a refresh token', async () => {
    const { token } = await makeUser();

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: token });
    expect(res.status).toBe(401);
  });

  it('requires a refreshToken in the body', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the stored refresh token so it can no longer be rotated', async () => {
    const { email, password, token } = await makeUser();
    const login = await request(app).post('/api/auth/login').send({ email, password });

    expect((await as(token).post('/api/auth/logout')).status).toBe(204);

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(res.status).toBe(401);
  });
});

describe('role enforcement', () => {
  it('refuses a customer on a staff-only route and allows staff', async () => {
    const customer = await makeUser({ role: 'customer' });
    const staff = await makeUser({ role: 'staff' });
    const body = { name: 'Spin Class', capacity: 10, price: 1500, durationMinutes: 45 };

    expect((await as(customer.token).post('/api/resources').send(body)).status).toBe(403);
    expect((await as(staff.token).post('/api/resources').send(body)).status).toBe(201);
  });
});

describe('error handling', () => {
  it('returns 404 with the method and path for an unknown route', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('/api/nope');
  });

  it('returns 400 rather than crashing on a malformed JSON body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": broken');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not valid JSON/i);
  });
});

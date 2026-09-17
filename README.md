# Booking API

A REST API for booking time-limited resources (classes, rooms, equipment) with
JWT authentication, role-based access control, Stripe payments, and
concurrency-safe booking to prevent overbooking.

## Features

- **Auth**: JWT access + refresh tokens (rotated on refresh), bcrypt password hashing, rate-limited login/register
- **RBAC**: `admin` / `staff` / `customer` roles enforced via middleware
- **Resources**: CRUD with text search, price filtering, pagination, sorting
- **Bookings**: capacity-aware booking using MongoDB transactions to prevent race conditions
- **Payments**: Stripe PaymentIntents + webhook to confirm/cancel bookings on payment result
- **Validation**: Zod schemas on every write endpoint
- **Docs**: OpenAPI/Swagger UI at `/api/docs`
- **Tests**: Jest + Supertest, including a concurrency test that fires simultaneous booking requests to prove capacity limits hold

## Stack

Node.js, Express, MongoDB/Mongoose, JWT, Stripe, Zod, Jest.

## Getting started

```bash
npm install
cp .env.example .env   # fill in MongoDB URI, JWT secrets, Stripe keys
npm run dev
```

API docs: `http://localhost:5000/api/docs`

### Running tests

```bash
npm test
```

The concurrency test spins up an in-memory MongoDB replica set (required for
transactions) via `mongodb-memory-server` — no external database needed.

## Why this exists

Most CRUD-API portfolio projects skip the parts that actually come up in
backend interviews: race conditions, payment reconciliation, and refresh
token rotation. This project exists to have working, tested code for those
specifically:

- **Overbooking prevention**: booking creation runs inside a MongoDB
  transaction that checks current capacity and inserts atomically, with
  retry-on-conflict. See `src/controllers/bookingController.js` and the test
  in `tests/booking.concurrency.test.js`.
- **Payment reconciliation**: Stripe isn't transactional with MongoDB, so
  bookings start as `pending` and only flip to `confirmed` when the Stripe
  webhook confirms payment — not optimistically on the initial request.
- **Refresh token rotation**: each refresh invalidates the previous refresh
  token (hash stored, compared, replaced), reducing the blast radius of a
  leaked token.

## Project structure

```
src/
  config/       # db connection, swagger
  controllers/  # route handlers
  middleware/   # auth, validation, error handling
  models/       # Mongoose schemas
  routes/       # Express routers
  schemas/      # Zod validation schemas
  services/     # Stripe integration
tests/
```

## Possible extensions

- Email notifications on booking confirmation/cancellation
- Admin analytics endpoint (bookings per resource, revenue over time)
- Recurring availability instead of manually-created slots
- Deploy to Render/Railway + MongoDB Atlas, add a minimal frontend

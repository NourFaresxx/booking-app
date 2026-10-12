# Booking API

A REST API for booking time-limited resources (classes, rooms, equipment) with
JWT authentication, role-based access control, Stripe payments, and
concurrency-safe booking that cannot overbook a slot.

## Features

- **Auth**: JWT access + refresh tokens (rotated on refresh), bcrypt password hashing, rate-limited credential endpoints
- **RBAC**: `admin` / `staff` / `customer` roles, plus per-resource ownership checks
- **Resources**: CRUD with text search, price filtering, pagination, and allow-listed sorting
- **Recurring availability**: weekly opening hours in the resource's own timezone, expanded into bookable slots on demand — no pre-created slot rows
- **Bookings**: capacity-safe booking, automatic release of abandoned checkouts, refund on cancellation
- **Payments**: Stripe PaymentIntents with an idempotent webhook that reconciles bookings against payment outcomes
- **Analytics**: bookings, revenue, refunds and seat utilisation, scoped by resource ownership
- **Notifications**: confirmation / cancellation / expiry emails over SMTP, logged instead when SMTP isn't configured
- **Validation**: Zod schemas on every write endpoint
- **Docs**: OpenAPI 3 at `/api/docs`, raw spec at `/api/openapi.json`
- **Tests**: 128 Jest + Supertest tests, including concurrency, webhook idempotency and capacity-release coverage

## Stack

Node.js, Express, MongoDB/Mongoose, JWT, Stripe, Zod, Jest.

## Getting started

```bash
npm install
cp .env.example .env    # fill in MongoDB URI, two JWT secrets, Stripe keys
npm run seed            # optional: demo users and resources
npm run dev
```

API docs: `http://localhost:5000/api/docs`

The seed script creates `admin@example.com`, `staff@example.com` and
`customer@example.com`, all with the password `password123`.

To change someone's role:

```bash
npm run promote -- someone@example.com staff
```

### Running tests

```bash
npm test
```

The suite spins up one in-memory MongoDB replica set for the whole run
(`mongodb-memory-server`) — no external database needed. A replica set rather
than a standalone server, because transactions require one.

## Why this exists

Most CRUD-API portfolio projects skip the parts that actually come up in
backend interviews: race conditions, payment reconciliation, and token
handling. This project exists to have working, tested code for those.

### Overbooking is prevented by a counter, not by a transaction

The obvious approach — count active bookings, insert if under capacity, wrap
it in a transaction — **does not work**, and the reason is worth knowing.
MongoDB transactions detect a conflict only when two transactions touch the
*same document*. Two concurrent requests each inserting a brand-new `Booking`
never collide, so every request reads the same pre-insert count and they all
pass the capacity check. The transaction provides no protection at all.

Instead, capacity lives as a counter on a single `BookingSlot` document per
`(resource, slotStart)`. Reserving a seat is one conditional update:

```js
BookingSlot.findOneAndUpdate(
  { resourceId, slotStart, $expr: { $lt: ['$bookedCount', '$capacity'] } },
  { $inc: { bookedCount: 1 } }
)
```

Single-document updates are atomic in MongoDB, so the check and the increment
cannot interleave. `tests/booking.concurrency.test.js` fires simultaneous
requests at a 3-seat and a 1-seat slot and asserts the counts hold.

One consequence worth noting: the slot counter document must be created
*outside* the transaction. Inside one, losing the create race raises a
duplicate-key error that aborts the whole transaction — and an aborted
transaction can't be continued, even though the error itself is harmless.

### Every seat release is exactly-once

A seat is freed on cancellation, on payment failure, and on checkout expiry —
and Stripe delivers webhooks at least once, so each of those can arrive twice.
Every release is therefore gated on a conditional status transition:

```js
Booking.findOneAndUpdate({ _id, status: 'pending' }, { status: 'cancelled' })
```

Only the caller whose update actually matched goes on to decrement the
counter. A redelivered event finds the booking already moved and does nothing,
so the counter can't drift. Webhook event ids are also recorded in a
deduplication collection, and the `$gt: 0` guard on the decrement is a final
backstop against a negative count.

### Abandoned checkouts don't leak capacity

A booking starts as `pending` and holds a seat. If payment is never completed,
that seat would be held forever — every abandoned checkout permanently
shrinking the slot. Pending bookings carry an `expiresAt`, and a sweeper
(`src/jobs/bookingMaintenance.js`) expires them and returns the seat.

The sweeper's transition is conditional too, so a payment that confirms in the
same moment is never expired out from under the customer. And if a payment
lands *after* expiry, the webhook refunds it rather than confirming a booking
whose seat may already have been resold.

### Payment reconciliation

Stripe can't participate in a MongoDB transaction, so bookings are created
first and confirmed only when the webhook reports success — never
optimistically. The one case that needs undoing by hand is a payment intent
that can't be created at all: there the booking is cancelled and the seat
released explicitly, because there is no webhook coming to reconcile it.

### Refresh token rotation (and why bcrypt was wrong for it)

Each refresh invalidates the previous refresh token: the stored hash is
compared, then replaced.

The stored hash is SHA-256, not bcrypt, which matters more than it looks.
bcrypt ignores everything past the first 72 bytes of its input, and a JWT's
first 72 bytes are the fixed header plus the beginning of `{"sub":"<user id>`
— byte-identical for every token that user will ever be issued. bcrypt
therefore could not distinguish one of a user's refresh tokens from another,
and rotation silently failed to invalidate anything. bcrypt is also simply the
wrong tool: its cost exists to slow brute force against low-entropy human
passwords, while a signed JWT already carries full-strength HMAC entropy.
Passwords still use bcrypt, capped at 72 bytes so nothing is truncated.

`tests/tokens.test.js` demonstrates the bcrypt collision directly.

### Recurring availability

Slots are generated from weekly opening hours rather than stored, so a
resource's schedule is four rows instead of thousands of slot documents.
Opening hours are wall-clock times in the resource's own IANA timezone, so
"Mondays 09:00" stays 09:00 local across a DST change instead of drifting by
an hour. `src/utils/timezone.js` does this with `Intl` alone, no date library.

Booking validates the requested `slotStart` against the same generator, so an
arbitrary timestamp can't be booked on a resource that isn't open then.

## Project structure

```
src/
  config/       # db connection, OpenAPI spec
  controllers/  # route handlers
  jobs/         # pending-booking expiry and completion sweeper
  middleware/   # auth, validation, error handling
  models/       # Mongoose schemas
  routes/       # Express routers + OpenAPI annotations
  schemas/      # Zod validation schemas
  services/     # slots, availability, payments, notifications
  utils/        # tokens, timezone maths
scripts/        # seed, promoteUser
tests/
frontend/       # React + Vite customer web app (see below)
```

## Frontend

`frontend/` is a React + Vite app covering the customer-facing flow: register/
log in, browse and search resources, pick an available slot, pay with Stripe
Elements, and view/cancel bookings. Staff/admin actions (managing resources,
analytics) aren't in the UI — use `/api/docs` or the scripts above for those.

```bash
cd frontend
npm install
cp .env.example .env    # API URL + Stripe PUBLISHABLE key
npm run dev              # http://localhost:5173
```

Also set `CLIENT_URL=http://localhost:5173` in the API's own `.env` so CORS
allows the dev server to call it.

Notes:

- The access token lives in memory only (never `localStorage`); only the
  refresh token is persisted, and the client transparently refreshes once on
  a 401. A reload always costs one 401-then-refresh round trip by design —
  there's no way to know the in-memory token is stale without trying it, and
  persisting it to survive reloads would mean keeping it somewhere an XSS
  payload could read it.
- `VITE_STRIPE_PUBLISHABLE_KEY` must be the publishable key from the *same*
  Stripe account as the API's `STRIPE_SECRET_KEY`, or Stripe Elements will
  mount but silently fail to render actual payment fields.

## API overview

| Method | Path | Access |
| --- | --- | --- |
| `POST` | `/api/auth/register` | public |
| `POST` | `/api/auth/login` | public |
| `POST` | `/api/auth/refresh` | public |
| `GET` | `/api/auth/me` | authenticated |
| `POST` | `/api/auth/logout` | authenticated |
| `GET` | `/api/resources` | public |
| `GET` | `/api/resources/:id` | public |
| `GET` | `/api/resources/:id/availability` | public |
| `POST` | `/api/resources` | staff, admin |
| `PATCH` | `/api/resources/:id` | owner, admin |
| `DELETE` | `/api/resources/:id` | owner, admin |
| `POST` | `/api/bookings` | authenticated |
| `GET` | `/api/bookings/me` | authenticated |
| `GET` | `/api/bookings/:id` | owner, staff, admin |
| `PATCH` | `/api/bookings/:id/cancel` | owner, staff, admin |
| `GET` | `/api/bookings` | staff, admin |
| `GET` | `/api/analytics/overview` | staff, admin |
| `POST` | `/api/webhooks/stripe` | Stripe signature |
| `GET` | `/health` | public |

All money values are integers in the minor currency unit (cents).

### Booking flow

1. `GET /api/resources/:id/availability` → pick a slot with `bookable: true`
2. `POST /api/bookings` with that slot's `start` → `pending` booking + `clientSecret` + `expiresAt`
3. Confirm the payment client-side with the `clientSecret`
4. Stripe calls `POST /api/webhooks/stripe` → booking becomes `confirmed`

If step 3 never happens, the sweeper expires the booking and frees the seat.

### Local webhook testing

```bash
stripe listen --forward-to localhost:5000/api/webhooks/stripe
```

Put the printed `whsec_...` value in `STRIPE_WEBHOOK_SECRET`.

## Notes and limitations

- **Transactions need a replica set.** MongoDB Atlas provides one; a bare
  local `mongod` does not.
- **One refresh token per user.** Logging in on a second device invalidates the
  first. Supporting concurrent sessions means storing a set of token hashes.
- **The maintenance sweeper assumes a single process.** Several instances
  behind a load balancer would each sweep. That stays *correct*, because every
  transition is a conditional update, but it duplicates work; a real
  deployment should elect one scheduler or take a lock.
- **Overnight opening hours** must be entered as two same-day windows.
- **Analytics utilisation** is measured over slots that saw at least one
  booking, not over every slot the opening hours imply.
- **Graceful shutdown relies on POSIX signals**, so it is inert on Windows,
  where the process is terminated outright. It works on any Linux deployment.

## Possible extensions

- Deploy to Render/Railway + MongoDB Atlas, and the frontend to Vercel/Netlify
- A staff/admin UI (resource management, analytics) alongside the customer one
- Per-session refresh tokens so multiple devices can stay logged in
- Waitlists: offer a freed seat to the next person in line
- Recurring bookings ("every Monday for 8 weeks")
- Move the sweeper to a locked or external scheduler for multi-instance deploys

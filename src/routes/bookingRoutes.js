const express = require('express');
const {
  createBooking,
  listMyBookings,
  listAllBookings,
  getBooking,
  cancelBooking,
} = require('../controllers/bookingController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createBookingSchema } = require('../schemas/bookingSchemas');

const router = express.Router();

router.use(requireAuth);

/**
 * @openapi
 * /bookings:
 *   post:
 *     tags: [Bookings]
 *     summary: Book a slot and start payment
 *     description: >
 *       Reserves a seat and returns a Stripe `clientSecret` to complete payment
 *       with. The booking is created as `pending` and becomes `confirmed` only
 *       when Stripe's webhook reports the payment succeeded. If payment isn't
 *       completed before `expiresAt`, the seat is released automatically.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resourceId, slotStart]
 *             properties:
 *               resourceId: { type: string, example: 66f1a2b3c4d5e6f708192a3b }
 *               slotStart:
 *                 type: string
 *                 format: date-time
 *                 description: Must match a slot from the availability endpoint
 *                 example: 2026-11-03T09:00:00.000Z
 *     responses:
 *       201:
 *         description: Seat reserved, payment pending
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 booking: { $ref: '#/components/schemas/Booking' }
 *                 clientSecret: { type: string }
 *                 expiresAt: { type: string, format: date-time }
 *       400: { description: Slot is in the past or not an available slot }
 *       404: { description: Resource not found }
 *       409: { description: Slot is fully booked, or you already hold this slot }
 *       502: { description: Payment provider could not start a payment }
 */
router.post('/', validate(createBookingSchema), createBooking);

/**
 * @openapi
 * /bookings/me:
 *   get:
 *     tags: [Bookings]
 *     summary: List your own bookings
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, cancelled, completed, expired]
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: A page of your bookings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Booking' }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 */
router.get('/me', listMyBookings);

/**
 * @openapi
 * /bookings:
 *   get:
 *     tags: [Bookings]
 *     summary: List all bookings (staff or admin)
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, cancelled, completed, expired]
 *       - in: query
 *         name: resourceId
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *         description: Filter on slotStart >= from
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *         description: Filter on slotStart < to
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200: { description: A page of bookings }
 *       403: { description: Requires staff or admin }
 */
router.get('/', requireRole('staff', 'admin'), listAllBookings);

/**
 * @openapi
 * /bookings/{id}:
 *   get:
 *     tags: [Bookings]
 *     summary: Get one booking (owner, staff, or admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The booking
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Booking' }
 *       403: { description: Not your booking }
 *       404: { description: Booking not found }
 */
router.get('/:id', getBooking);

/**
 * @openapi
 * /bookings/{id}/cancel:
 *   patch:
 *     tags: [Bookings]
 *     summary: Cancel a booking and release its seat
 *     description: >
 *       Idempotent — cancelling an already-cancelled booking returns it
 *       unchanged. A paid booking is refunded; an unpaid one has its payment
 *       intent voided. Customers cannot cancel once the slot has started;
 *       staff and admins can.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The cancelled booking
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Booking' }
 *       403: { description: Not your booking }
 *       404: { description: Booking not found }
 *       409: { description: Already completed, or the slot has started }
 */
router.patch('/:id/cancel', cancelBooking);

module.exports = router;

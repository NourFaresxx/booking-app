const express = require('express');
const { getOverview } = require('../controllers/analyticsController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('staff', 'admin'));

/**
 * @openapi
 * /analytics/overview:
 *   get:
 *     tags: [Analytics]
 *     summary: Booking and revenue summary (staff or admin)
 *     description: >
 *       Bookings and revenue bucketed by slot date, plus the top resources by
 *       revenue and seat utilisation across slots that saw demand. Amounts are
 *       in cents, taken from each booking's recorded amount rather than its
 *       resource's current price. Staff see only resources they own; admins see
 *       everything.
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *         description: Defaults to 30 days before `to`
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *         description: Defaults to now. Max range 400 days.
 *     responses:
 *       200:
 *         description: Summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 range:
 *                   type: object
 *                   properties:
 *                     from: { type: string, format: date-time }
 *                     to: { type: string, format: date-time }
 *                 totals:
 *                   type: object
 *                   properties:
 *                     bookings: { type: integer }
 *                     bookingsByStatus: { type: object, additionalProperties: { type: integer } }
 *                     paymentsByStatus: { type: object, additionalProperties: { type: integer } }
 *                     grossRevenue: { type: integer, description: Cents from paid bookings }
 *                     refundedRevenue: { type: integer, description: Cents refunded }
 *                     netRevenue: { type: integer }
 *                 occupancy:
 *                   type: object
 *                   properties:
 *                     slotsWithDemand: { type: integer }
 *                     seatsOffered: { type: integer }
 *                     seatsTaken: { type: integer }
 *                     utilisation: { type: number, format: float }
 *                 topResources:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       resourceId: { type: string }
 *                       name: { type: string }
 *                       bookings: { type: integer }
 *                       cancelled: { type: integer }
 *                       revenue: { type: integer }
 *                       refunded: { type: integer }
 *                 byDay:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date: { type: string, example: '2026-10-12' }
 *                       bookings: { type: integer }
 *                       revenue: { type: integer }
 *                       refunded: { type: integer }
 *       400: { description: Invalid or oversized date range }
 *       403: { description: Requires staff or admin }
 */
router.get('/overview', getOverview);

module.exports = router;

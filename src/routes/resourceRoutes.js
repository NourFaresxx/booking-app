const express = require('express');
const {
  listResources,
  getResource,
  createResource,
  updateResource,
  deleteResource,
  getAvailability,
} = require('../controllers/resourceController');
const { requireAuth, requireRole, optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createResourceSchema, updateResourceSchema } = require('../schemas/resourceSchemas');

const router = express.Router();

/**
 * @openapi
 * /resources:
 *   get:
 *     tags: [Resources]
 *     summary: List active resources
 *     security: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Full-text search over name and description
 *       - in: query
 *         name: minPrice
 *         schema: { type: integer }
 *         description: Minimum price in cents
 *       - in: query
 *         name: maxPrice
 *         schema: { type: integer }
 *         description: Maximum price in cents
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, -createdAt, price, -price, name, -name, capacity, -capacity, durationMinutes, -durationMinutes]
 *         description: Prefix with `-` for descending
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: includeInactive
 *         schema: { type: boolean, default: false }
 *         description: >
 *           Include deactivated resources too. Ignored unless the caller is
 *           authenticated as staff or admin — a public/customer request
 *           always sees active resources only, regardless of this flag.
 *     responses:
 *       200:
 *         description: A page of resources
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Resource' }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 *       400: { description: Invalid sort or price filter }
 */
router.get('/', optionalAuth, listResources);

/**
 * @openapi
 * /resources/{id}:
 *   get:
 *     tags: [Resources]
 *     summary: Get one resource
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The resource
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Resource' }
 *       404: { description: Resource not found }
 */
router.get('/:id', getResource);

/**
 * @openapi
 * /resources/{id}/availability:
 *   get:
 *     tags: [Resources]
 *     summary: Bookable slots and remaining capacity for a date range
 *     description: >
 *       Slots are generated from the resource's recurring weekly opening hours
 *       (interpreted in the resource's own timezone), so they don't need to be
 *       created in advance. A resource with no opening hours is treated as open
 *       around the clock. Use a `start` value from this response as the
 *       `slotStart` when creating a booking.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *         description: Defaults to now
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *         description: Defaults to 7 days after `from`. Max range 62 days.
 *     responses:
 *       200:
 *         description: Generated slots with capacity
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 resource: { type: object }
 *                 range: { type: object }
 *                 slots:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/AvailabilitySlot' }
 *       400: { description: Invalid or oversized date range }
 *       404: { description: Resource not found }
 */
router.get('/:id/availability', getAvailability);

/**
 * @openapi
 * /resources:
 *   post:
 *     tags: [Resources]
 *     summary: Create a resource (staff or admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ResourceInput' }
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Resource' }
 *       400: { description: Validation failed or unknown timezone }
 *       403: { description: Requires staff or admin }
 */
router.post(
  '/',
  requireAuth,
  requireRole('staff', 'admin'),
  validate(createResourceSchema),
  createResource
);

/**
 * @openapi
 * /resources/{id}:
 *   patch:
 *     tags: [Resources]
 *     summary: Update a resource you own (admins may update any)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ResourceInput' }
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Resource' }
 *       403: { description: Not the owner }
 *       404: { description: Resource not found }
 */
router.patch(
  '/:id',
  requireAuth,
  requireRole('staff', 'admin'),
  validate(updateResourceSchema),
  updateResource
);

/**
 * @openapi
 * /resources/{id}:
 *   delete:
 *     tags: [Resources]
 *     summary: Deactivate a resource you own (admins may deactivate any)
 *     description: >
 *       Soft delete — the resource is marked inactive so existing bookings keep
 *       their history and revenue reporting stays accurate.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Deactivated }
 *       403: { description: Not the owner }
 *       404: { description: Resource not found }
 */
router.delete('/:id', requireAuth, requireRole('staff', 'admin'), deleteResource);

module.exports = router;

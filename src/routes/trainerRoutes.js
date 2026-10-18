const express = require('express');
const {
  listTrainers,
  getTrainer,
  createTrainer,
  updateTrainer,
  deleteTrainer,
} = require('../controllers/trainerController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createTrainerSchema, updateTrainerSchema } = require('../schemas/trainerSchemas');

const router = express.Router();

/**
 * @openapi
 * /trainers:
 *   get:
 *     tags: [Trainers]
 *     summary: List active trainers
 *     security: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Full-text search over name, bio, and specialties
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: A page of trainers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Trainer' }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 */
router.get('/', listTrainers);

/**
 * @openapi
 * /trainers/{id}:
 *   get:
 *     tags: [Trainers]
 *     summary: Get a trainer's profile and the active classes they teach
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The trainer and their classes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 trainer: { $ref: '#/components/schemas/Trainer' }
 *                 classes:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Resource' }
 *       404: { description: Trainer not found }
 */
router.get('/:id', getTrainer);

/**
 * @openapi
 * /trainers:
 *   post:
 *     tags: [Trainers]
 *     summary: Create a trainer profile (staff or admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TrainerInput' }
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Trainer' }
 *       400: { description: Validation failed }
 *       403: { description: Requires staff or admin }
 */
router.post(
  '/',
  requireAuth,
  requireRole('staff', 'admin'),
  validate(createTrainerSchema),
  createTrainer
);

/**
 * @openapi
 * /trainers/{id}:
 *   patch:
 *     tags: [Trainers]
 *     summary: Update a trainer profile (staff or admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TrainerInput' }
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Trainer' }
 *       403: { description: Requires staff or admin }
 *       404: { description: Trainer not found }
 */
router.patch(
  '/:id',
  requireAuth,
  requireRole('staff', 'admin'),
  validate(updateTrainerSchema),
  updateTrainer
);

/**
 * @openapi
 * /trainers/{id}:
 *   delete:
 *     tags: [Trainers]
 *     summary: Deactivate a trainer profile (staff or admin)
 *     description: >
 *       Soft delete — classes already linked to this trainer keep working and
 *       keep their booking history; the profile just stops appearing in
 *       public listings.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Deactivated }
 *       403: { description: Requires staff or admin }
 *       404: { description: Trainer not found }
 */
router.delete('/:id', requireAuth, requireRole('staff', 'admin'), deleteTrainer);

module.exports = router;

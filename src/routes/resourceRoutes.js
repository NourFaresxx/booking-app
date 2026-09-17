const express = require('express');
const {
  listResources,
  getResource,
  createResource,
  updateResource,
  deleteResource,
} = require('../controllers/resourceController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createResourceSchema, updateResourceSchema } = require('../schemas/resourceSchemas');

const router = express.Router();

router.get('/', listResources);
router.get('/:id', getResource);

router.post('/', requireAuth, requireRole('staff', 'admin'), validate(createResourceSchema), createResource);
router.patch('/:id', requireAuth, requireRole('staff', 'admin'), validate(updateResourceSchema), updateResource);
router.delete('/:id', requireAuth, requireRole('admin'), deleteResource);

module.exports = router;

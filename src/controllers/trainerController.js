const mongoose = require('mongoose');
const Trainer = require('../models/Trainer');
const Resource = require('../models/Resource');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

const listTrainers = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;

  const filter = { isActive: true };
  if (search) filter.$text = { $search: search };

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

  const [items, total] = await Promise.all([
    Trainer.find(filter)
      .sort('name')
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Trainer.countDocuments(filter),
  ]);

  res.json({
    items,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

/**
 * A trainer's profile plus the active classes they teach, so a client
 * deciding "which trainer should I pick" can see both in one request instead
 * of fetching every resource and filtering client-side.
 */
const getTrainer = asyncHandler(async (req, res) => {
  const trainer = await findTrainerOr404(req.params.id);

  const classes = await Resource.find({ trainerId: trainer._id, isActive: true }).sort(
    '-createdAt'
  );

  res.json({ trainer, classes });
});

const createTrainer = asyncHandler(async (req, res) => {
  const trainer = await Trainer.create(req.body);
  res.status(201).json(trainer);
});

const updateTrainer = asyncHandler(async (req, res) => {
  const trainer = await findTrainerOr404(req.params.id);
  Object.assign(trainer, req.body);
  await trainer.save();
  res.json(trainer);
});

const deleteTrainer = asyncHandler(async (req, res) => {
  const trainer = await findTrainerOr404(req.params.id);
  // Soft delete: classes already linked to this trainer keep their history
  // (and keep working) — they just stop showing an active trainer profile,
  // same tradeoff as deactivating a Resource.
  trainer.isActive = false;
  await trainer.save();
  res.status(204).send();
});

async function findTrainerOr404(id) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, 'Trainer not found');
  const trainer = await Trainer.findById(id);
  if (!trainer) throw new ApiError(404, 'Trainer not found');
  return trainer;
}

module.exports = { listTrainers, getTrainer, createTrainer, updateTrainer, deleteTrainer };

const Resource = require('../models/Resource');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

const listResources = asyncHandler(async (req, res) => {
  const { search, minPrice, maxPrice, sort = '-createdAt', page = 1, limit = 20 } = req.query;

  const filter = { isActive: true };
  if (search) filter.$text = { $search: search };
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }

  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(100, Math.max(1, Number(limit)));

  const [items, total] = await Promise.all([
    Resource.find(filter)
      .sort(sort)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Resource.countDocuments(filter),
  ]);

  res.json({
    items,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

const getResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findById(req.params.id);
  if (!resource) throw new ApiError(404, 'Resource not found');
  res.json(resource);
});

const createResource = asyncHandler(async (req, res) => {
  const resource = await Resource.create({ ...req.body, ownerId: req.user.id });
  res.status(201).json(resource);
});

const updateResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!resource) throw new ApiError(404, 'Resource not found');
  res.json(resource);
});

const deleteResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );
  if (!resource) throw new ApiError(404, 'Resource not found');
  res.status(204).send();
});

module.exports = { listResources, getResource, createResource, updateResource, deleteResource };

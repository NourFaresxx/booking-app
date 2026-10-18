const mongoose = require('mongoose');
const Resource = require('../models/Resource');
const Trainer = require('../models/Trainer');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { generateSlots, MAX_RANGE_DAYS } = require('../services/availabilityService');
const { getBookedCounts } = require('../services/slotService');
const { isValidTimeZone } = require('../utils/timezone');

// `sort` comes from the query string and goes straight into Mongo, so it is
// matched against a fixed list rather than passed through — an arbitrary value
// would let a caller sort on (and so probe) fields the response never exposes.
const SORTABLE_FIELDS = ['createdAt', 'price', 'name', 'capacity', 'durationMinutes'];
const DEFAULT_SORT = '-createdAt';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const listResources = asyncHandler(async (req, res) => {
  const { search, minPrice, maxPrice, sort, page = 1, limit = 20 } = req.query;

  // `includeInactive` only works for staff/admin — a customer's browse page
  // should never surface a deactivated class no matter what query string
  // they send.
  const canSeeInactive = req.query.includeInactive === 'true' && isStaffOrAdmin(req.user);
  const filter = canSeeInactive ? {} : { isActive: true };
  if (search) filter.$text = { $search: search };

  const min = parseMoney(minPrice, 'minPrice');
  const max = parseMoney(maxPrice, 'maxPrice');
  if (min !== null || max !== null) {
    filter.price = {};
    if (min !== null) filter.price.$gte = min;
    if (max !== null) filter.price.$lte = max;
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

  const [items, total] = await Promise.all([
    Resource.find(filter)
      .sort(parseSort(sort))
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate('trainerId', 'name title photoUrl'),
    Resource.countDocuments(filter),
  ]);

  res.json({
    items,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

const getResource = asyncHandler(async (req, res) => {
  const resource = await findResourceOr404(req.params.id);
  await resource.populate('trainerId', 'name title photoUrl');
  res.json(resource);
});

const createResource = asyncHandler(async (req, res) => {
  if (req.body.timezone && !isValidTimeZone(req.body.timezone)) {
    throw new ApiError(400, `Unknown timezone: ${req.body.timezone}`);
  }
  if (req.body.trainerId) await assertTrainerExists(req.body.trainerId);

  const resource = await Resource.create({ ...req.body, ownerId: req.user.id });
  res.status(201).json(resource);
});

const updateResource = asyncHandler(async (req, res) => {
  const resource = await findResourceOr404(req.params.id);
  assertCanManage(resource, req.user);

  if (req.body.timezone && !isValidTimeZone(req.body.timezone)) {
    throw new ApiError(400, `Unknown timezone: ${req.body.timezone}`);
  }
  if (req.body.trainerId) await assertTrainerExists(req.body.trainerId);

  Object.assign(resource, req.body);
  await resource.save();
  res.json(resource);
});

const deleteResource = asyncHandler(async (req, res) => {
  const resource = await findResourceOr404(req.params.id);
  assertCanManage(resource, req.user);

  // Soft delete: bookings reference this resource, and hard-deleting it would
  // orphan their history and break revenue reporting.
  resource.isActive = false;
  await resource.save();
  res.status(204).send();
});

/**
 * Bookable slots for a resource over a date range, with remaining capacity.
 *
 * Slots are derived from the resource's recurring opening hours rather than
 * stored, so nobody has to create them up front. Remaining capacity comes
 * from the BookingSlot counters, which only exist for slots someone has
 * already booked — a missing counter simply means the slot is untouched.
 */
const getAvailability = asyncHandler(async (req, res) => {
  const resource = await findResourceOr404(req.params.id);

  const from = req.query.from ? parseDate(req.query.from, 'from') : new Date();
  const to = req.query.to
    ? parseDate(req.query.to, 'to')
    : new Date(from.getTime() + 7 * MS_PER_DAY);

  if (to <= from) throw new ApiError(400, '`to` must be after `from`');
  if (to - from > MAX_RANGE_DAYS * MS_PER_DAY) {
    throw new ApiError(400, `Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  }

  const slots = generateSlots(resource, from, to);
  const counters = await getBookedCounts({ resourceId: resource._id, from, to });
  const now = Date.now();

  res.json({
    resource: {
      id: resource._id,
      name: resource.name,
      capacity: resource.capacity,
      price: resource.price,
      currency: resource.currency,
      durationMinutes: resource.durationMinutes,
      timezone: resource.timezone,
    },
    range: { from, to },
    slots: slots.map((slot) => {
      const counter = counters.get(slot.start.toISOString());
      // A counter created before a capacity change keeps its original
      // capacity, so trust it over the resource's current value.
      const capacity = counter ? counter.capacity : resource.capacity;
      const booked = counter ? counter.bookedCount : 0;
      const remaining = Math.max(0, capacity - booked);
      return {
        start: slot.start,
        end: slot.end,
        capacity,
        booked,
        remaining,
        bookable: remaining > 0 && slot.start.getTime() > now && resource.isActive,
      };
    }),
  });
});

async function findResourceOr404(id) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, 'Resource not found');
  const resource = await Resource.findById(id);
  if (!resource) throw new ApiError(404, 'Resource not found');
  return resource;
}

function isStaffOrAdmin(user) {
  return Boolean(user) && ['staff', 'admin'].includes(user.role);
}

/** Staff manage only what they own; admins manage everything. */
function assertCanManage(resource, user) {
  if (user.role === 'admin') return;
  if (resource.ownerId.toString() !== user.id) {
    throw new ApiError(403, 'You can only modify resources you own');
  }
}

/** Rejects a trainerId that doesn't correspond to a real Trainer document. */
async function assertTrainerExists(trainerId) {
  const exists = await Trainer.exists({ _id: trainerId });
  if (!exists) throw new ApiError(400, 'trainerId does not refer to an existing trainer');
}

function parseSort(sort) {
  if (!sort) return DEFAULT_SORT;
  const field = sort.startsWith('-') ? sort.slice(1) : sort;
  if (!SORTABLE_FIELDS.includes(field)) {
    throw new ApiError(400, `Cannot sort by "${field}". Allowed: ${SORTABLE_FIELDS.join(', ')}`);
  }
  return sort;
}

function parseMoney(value, label) {
  if (value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ApiError(400, `${label} must be a non-negative number of cents`);
  }
  return parsed;
}

function parseDate(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, `Invalid ${label} date`);
  return date;
}

module.exports = {
  listResources,
  getResource,
  createResource,
  updateResource,
  deleteResource,
  getAvailability,
};

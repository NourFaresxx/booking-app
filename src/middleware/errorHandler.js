// Wrap async route handlers so thrown errors reach errorHandler instead of
// crashing the process or requiring try/catch in every controller.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function notFound(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  if (statusCode === 500) {
    console.error(err);
  }

  res.status(statusCode).json({ error: message });
}

module.exports = { asyncHandler, ApiError, notFound, errorHandler };

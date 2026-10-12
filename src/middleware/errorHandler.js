const { ZodError, formatZodError } = require('./validate');

// Wraps async route handlers so a rejected promise reaches errorHandler
// instead of becoming an unhandled rejection and hanging the request.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

function notFound(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Single place where an error becomes a response.
 *
 * Only messages this code chose are sent to clients. A 500 is reported as a
 * generic string, because the underlying message can carry connection strings,
 * query contents or file paths.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json(formatZodError(err));
  }

  // Malformed JSON body — express.json() surfaces this as a SyntaxError.
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }

  if (err.name === 'ValidationError' && err.errors) {
    return res.status(400).json({
      error: 'Validation failed',
      details: Object.entries(err.errors).map(([path, detail]) => ({
        path,
        message: detail.message,
      })),
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ error: `Invalid value for ${err.path}` });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {}).join(', ') || 'field';
    return res.status(409).json({ error: `Duplicate value for ${field}` });
  }

  if (err.message?.startsWith('Origin not allowed by CORS')) {
    return res.status(403).json({ error: err.message });
  }

  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    console.error(err);
    return res.status(statusCode).json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message || 'Internal server error',
    });
  }

  res.status(statusCode).json({ error: err.message });
}

module.exports = { asyncHandler, ApiError, notFound, errorHandler };

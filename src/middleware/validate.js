const { ZodError } = require('zod');

/** Validates and replaces req.body, so handlers only ever see parsed input. */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (result.success) {
      req.body = result.data;
      return next();
    }
    return next(result.error);
  };
}

/** Shapes a ZodError into the API's error response. */
function formatZodError(err) {
  return {
    error: 'Validation failed',
    details: (err.issues || err.errors || []).map((issue) => ({
      path: issue.path.join('.') || '(body)',
      message: issue.message,
    })),
  };
}

module.exports = { validate, formatZodError, ZodError };

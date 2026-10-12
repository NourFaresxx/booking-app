const express = require('express');
const { handleStripeWebhook } = require('../controllers/webhookController');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @openapi
 * /webhooks/stripe:
 *   post:
 *     tags: [Webhooks]
 *     summary: Stripe event receiver
 *     description: >
 *       Called by Stripe, not by clients. Authenticated by the
 *       `stripe-signature` header over the raw request body, so this route is
 *       mounted with `express.raw()` ahead of the JSON body parser. Handling is
 *       idempotent: event ids are recorded and replays are acknowledged without
 *       re-running a handler.
 *     security: []
 *     parameters:
 *       - in: header
 *         name: stripe-signature
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Event handled or ignored }
 *       400: { description: Signature verification failed — do not retry }
 *       500: { description: Handler failed — Stripe should retry }
 */
// Wrapped so a thrown error reaches the error handler. Without this an async
// handler's rejection would be an unhandled promise rejection and Stripe would
// see a hung request instead of a retryable 500.
router.post('/stripe', asyncHandler(handleStripeWebhook));

module.exports = router;

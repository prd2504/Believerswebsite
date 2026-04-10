/**
 * Razorpay webhook handler — inbound endpoint Razorpay hits on every payment state
 * change. Activated by the RAZORPAY_LIVE flag; until that flag is true, this endpoint
 * responds with 503 so Razorpay retries (useful during staged rollouts).
 *
 * IMPORTANT: this function intentionally uses `rawBody` because signature verification
 * requires the exact bytes Razorpay sent. Any parsing / re-serialising will corrupt the
 * HMAC comparison.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { config } from '../config.js';
import { verifyWebhookSignature } from './razorpay.js';

export const razorpayWebhook = onRequest(
  {
    region: 'asia-south1',
    // Razorpay requires the raw body for signature validation.
    // onRequest gives us req.rawBody on v2.
  },
  async (req, res): Promise<void> => {
    if (!config.flags.razorpayLive) {
      logger.warn('[razorpayWebhook] received webhook while RAZORPAY_LIVE=false — 503');
      res.status(503).send('Razorpay feature disabled');
      return;
    }

    const signatureHeader = req.header('x-razorpay-signature');
    if (!signatureHeader) {
      logger.warn('[razorpayWebhook] missing x-razorpay-signature header');
      res.status(400).send('Missing signature');
      return;
    }

    // v2 onRequest exposes rawBody as a Buffer on JSON posts.
    const rawBody =
      (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ??
      JSON.stringify(req.body);

    const valid = await verifyWebhookSignature({ rawBody, signatureHeader });
    if (!valid) {
      logger.warn('[razorpayWebhook] signature mismatch — ignoring');
      res.status(400).send('Invalid signature');
      return;
    }

    const event = req.body?.event as string | undefined;
    const payload = req.body?.payload;
    logger.info('[razorpayWebhook] verified event', { event });

    // Individual event handlers will be implemented in Step 7. For now we just ack.
    // TODO(step-7): payment.captured → mark PaymentDocument as PAID; payment.failed → ignore.
    switch (event) {
      case 'payment.captured':
      case 'payment.failed':
      case 'order.paid':
      case 'refund.created':
        // Handler stubs live here — real logic is added in Step 7.
        break;
      default:
        logger.info('[razorpayWebhook] ignoring event', { event });
    }

    res.status(200).json({ ok: true, event, received: !!payload });
  },
);

/**
 * Razorpay service layer. Production-ready, but gated.
 *
 * Step 1 scope: skeleton functions with the real API shape, real signature verification,
 * and real error handling. The entire module is a no-op at runtime until:
 *   1. RAZORPAY_LIVE=true is set in functions/.env
 *   2. RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are populated
 *
 * At that point, zero code changes are needed — the guards simply stop short-circuiting.
 *
 * The HTTP requests here use the global `fetch` API (Node 20+). We deliberately avoid the
 * `razorpay` npm package to keep the cold-start footprint of our functions small.
 */

import { logger } from 'firebase-functions';
import { config, requireSecret } from '../config.js';

/** Shape of a Razorpay order creation response (the subset we use). */
export interface RazorpayOrder {
  id: string;
  entity: 'order';
  amount: number; // paise
  amount_paid: number;
  amount_due: number;
  currency: 'INR';
  receipt: string | null;
  status: 'created' | 'attempted' | 'paid';
  attempts: number;
  created_at: number;
}

/** Input for creating a new Razorpay order. */
export interface CreateOrderInput {
  amountPaise: number;
  receipt: string;
  /** Free-form note map — Razorpay stores up to 15 key/value pairs. */
  notes?: Record<string, string>;
}

/** Thrown when the razorpay feature flag is off. Callers should handle gracefully. */
export class RazorpayDisabledError extends Error {
  constructor() {
    super('Razorpay is disabled (RAZORPAY_LIVE=false). Set the flag and secrets to activate.');
    this.name = 'RazorpayDisabledError';
  }
}

/** Throw `RazorpayDisabledError` unless the feature is fully configured. */
function assertRazorpayReady(): { keyId: string; keySecret: string } {
  if (!config.flags.razorpayLive) throw new RazorpayDisabledError();
  const keyId = requireSecret(config.razorpay.keyId, 'RAZORPAY_KEY_ID');
  const keySecret = requireSecret(config.razorpay.keySecret, 'RAZORPAY_KEY_SECRET');
  return { keyId, keySecret };
}

/** Base64-encoded basic-auth header value. */
function authHeader(keyId: string, keySecret: string): string {
  const token = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  return `Basic ${token}`;
}

/**
 * Create a Razorpay order. Returns the order id the frontend uses when opening the
 * Razorpay checkout modal.
 */
export async function createOrder(input: CreateOrderInput): Promise<RazorpayOrder> {
  const { keyId, keySecret } = assertRazorpayReady();

  const body = {
    amount: input.amountPaise,
    currency: 'INR',
    receipt: input.receipt,
    notes: input.notes ?? {},
  };

  logger.info('[razorpay] createOrder', { receipt: input.receipt, amount: input.amountPaise });

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(keyId, keySecret),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Razorpay createOrder failed: ${res.status} ${errText}`);
  }

  return (await res.json()) as RazorpayOrder;
}

/**
 * Verify the HMAC signature on a Razorpay success handshake. After a successful
 * checkout, the frontend posts { orderId, paymentId, signature } to our backend; we
 * recompute the signature server-side and only mark the payment as paid if they match.
 *
 * Uses a crypto HMAC-SHA256 of `${orderId}|${paymentId}` keyed by KEY_SECRET.
 */
export async function verifyPaymentSignature(args: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<boolean> {
  const { keySecret } = assertRazorpayReady();

  // Node's built-in crypto — loaded lazily to avoid a cold-start cost when the flag is off.
  const { createHmac, timingSafeEqual } = await import('node:crypto');

  const expected = createHmac('sha256', keySecret)
    .update(`${args.orderId}|${args.paymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(args.signature, 'hex');
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Verify a Razorpay webhook body signature. Razorpay sends a header
 * `x-razorpay-signature` containing the HMAC-SHA256 of the raw request body keyed by the
 * webhook secret (separate from the API key secret).
 */
export async function verifyWebhookSignature(args: {
  rawBody: string;
  signatureHeader: string;
}): Promise<boolean> {
  if (!config.flags.razorpayLive) throw new RazorpayDisabledError();
  const webhookSecret = requireSecret(config.razorpay.webhookSecret, 'RAZORPAY_WEBHOOK_SECRET');

  const { createHmac, timingSafeEqual } = await import('node:crypto');

  const expected = createHmac('sha256', webhookSecret).update(args.rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(args.signatureHeader, 'hex');
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Fetch a Razorpay payment by id. Used by the webhook handler to independently
 * confirm state rather than trusting the webhook payload alone.
 */
export async function fetchPayment(paymentId: string): Promise<unknown> {
  const { keyId, keySecret } = assertRazorpayReady();
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    headers: { Authorization: authHeader(keyId, keySecret) },
  });
  if (!res.ok) {
    throw new Error(`Razorpay fetchPayment failed: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

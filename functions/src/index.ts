/**
 * Cloud Functions entry point. Re-exports every deployable function under a descriptive
 * name. Firebase inspects this file at deploy time.
 *
 * Step 1 scope: only the auth triggers and a health-check endpoint are wired up. The
 * payment, progress, and notification functions are defined but will be imported from
 * here as they are implemented in later steps.
 */

// Ensure Admin SDK is initialised before anything else imports db/auth.
import './admin.js';

// --- Auth triggers ---------------------------------------------------------------------
export { onUserCreatedTrigger } from './auth/onUserCreated.js';

// --- Health check ----------------------------------------------------------------------
export { health } from './http/health.js';

// Payments, progress, notifications, whatsapp, and razorpay webhooks are scaffolded but
// not yet deployable — they will be re-exported here as they are wired up in Steps 7+.

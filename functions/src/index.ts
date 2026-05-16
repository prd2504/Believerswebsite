/**
 * Cloud Functions entry point. All deployable functions are re-exported here.
 * Firebase inspects this file at deploy time.
 */

// Ensure Admin SDK is initialised before anything else imports db/auth.
import './admin.js';

// --- Auth triggers -----------------------------------------------------------------------
export { onUserCreatedTrigger } from './auth/onUserCreated.js';

// --- Health check ------------------------------------------------------------------------
export { health } from './http/health.js';

// --- Notifications / Broadcasts ----------------------------------------------------------
export { onBroadcastCreated } from './notifications/broadcast.js';

// --- Attendance email digest -------------------------------------------------------------
export { onAttendanceRecordCreated } from './attendance/onAttendanceMarked.js';

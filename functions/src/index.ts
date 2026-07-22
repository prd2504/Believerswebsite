/* Cloud Functions entry – v2 – 2026-06-11 */

// Ensure Admin SDK is initialised before anything else imports db/auth.
import './admin.js';

// --- Auth triggers -----------------------------------------------------------------------
export { onUserCreatedTrigger } from './auth/onUserCreated.js';

// --- Health check ------------------------------------------------------------------------
export { health } from './http/health.js';

// --- Notifications / Broadcasts ----------------------------------------------------------
export { onBroadcastCreated } from './notifications/broadcast.js';

// --- Attendance email digest (consolidated per centre + date) ----------------------------
export { onAttendanceDigest } from './attendance/onAttendanceMarked.js';

// --- Session log: late punch-in detection ------------------------------------------------
export { onSessionLogUpdated } from './sessionLogs/onSessionUpdated.js';

// --- Parent feedback: escalation notification --------------------------------------------
export { onFeedbackCreated } from './feedback/onFeedbackCreated.js';

// --- Payroll: send salary slip email when marked PAID ------------------------------------
export { onPayrollPaid } from './payroll/onPayrollPaid.js';

// --- Fee submission (Sheets + public /fees page) -----------------------------------------
export { submitFeePayment } from './fees/submitFeePayment.js';
export { lookupStudent } from './fees/lookupStudent.js';

// --- Public /fees page support (centres, name search, self-registration) -----------------
export { listCentres } from './fees/listCentres.js';
export { listCoaches } from './fees/listCoaches.js';
export { searchStudents } from './fees/searchStudents.js';
export { registerStudent } from './fees/registerStudent.js';

// --- Temporary: student data-integrity audit (remove after backfill decision) -------------
export { auditStudents } from './fees/auditStudents.js';
export { findDuplicateStudents } from './fees/findDuplicateStudents.js';
export { mergeStudents } from './fees/mergeStudents.js';
export { reconcileStudentIds } from './fees/reconcileStudentIds.js';
export { backfillStudentIds } from './fees/backfillStudentIds.js';
export { setStudentExternalId } from './fees/setStudentExternalId.js';
export { backfillEnrollments } from './fees/backfillEnrollments.js';

// --- Fee invoice email (on payment marked PAID with paymentSource) -----------------------
export { onFeePaymentCreated } from './fees/onFeePaymentCreated.js';

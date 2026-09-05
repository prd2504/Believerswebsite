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

// --- Fee vs attendance reconciliation (monthly report + email) -----------------------------
export {
  scheduledFeeAttendanceReport,
  generateFeeAttendanceReport,
} from './fees/feeAttendanceReport.js';

// --- Slot booking window auto-scheduling ---------------------------------------------------
export {
  scheduledSlotWindow,
  scheduleSlotWindowNow,
  weeklyPlanCandidates,
} from './slots/scheduleSlotWindow.js';
export { onCourtBookingSheetSync, onCourtPlanSheetSync } from './slots/courtSheetSync.js';

// --- Batch enrolment counter: rebuilt from source on every enrollment write
//     (see enrollments/onEnrollmentWritten.ts for the drift history) ---------
export { onEnrollmentWritten } from './enrollments/onEnrollmentWritten.js';
// Ruia bookings are the source of truth for who attends there; enrolments are
// their projection, so the rest of the app needs no Ruia special case.
export {
  onSlotBookingWritten,
  monthlyBookingEnrollmentSync,
  backfillBookingEnrollments,
} from './slots/syncBookingEnrollments.js';
// One-off: attach studentIds to the bookings taken before that field existed.
export { linkBookingsToStudents } from './slots/linkBookingsToStudents.js';
// Read-only report: one person entered more than once.
export { duplicateStudents } from './fees/duplicateStudents.js';
export { backfillBatchCounters } from './enrollments/backfillBatchCounters.js';
export { onCourtBookingCreated } from './slots/onCourtBookingCreated.js';

// --- Slot booking writes (moved server-side to keep phone numbers private) ------------------
export {
  checkSlotBookingDuplicate,
  createSlotBooking,
  backfillSlotBookingContacts,
} from './slots/slotBookingApi.js';

// --- Court booking reads + writes (courtBookings is admin-read, so the public
//     page cannot query it directly; see courtBookingApi.ts) ------------------
export {
  courtAvailability,
  createCourtBookingPublic,
  createCourtPlanPublic,
} from './slots/courtBookingApi.js';

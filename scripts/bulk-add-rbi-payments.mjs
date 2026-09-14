#!/usr/bin/env node

/**
 * Bulk-insert student payments for RBI Colony — June 2026.
 *
 * Usage (from the project root):
 *   node scripts/bulk-add-rbi-payments.mjs
 *
 * Prerequisites: firebase-admin must be installed (it's in functions/node_modules)
 * and the GOOGLE_APPLICATION_CREDENTIALS env var must point to a service account key,
 * OR you must be logged in via `firebase login` and have the project set.
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ── Config ──
const PROJECT_ID = 'bba-sports-prod';
const CENTRE_NAME = 'RBI Colony';
const MONTH = '2026-06';
const GST_RATE = 0;
const CREATED_BY = 'bulk-script';

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

const PAYMENTS = [
  { invoice: 'BBA-RBI-001', name: 'Meera Yadav', batch: '3-Day', amount: 3000 },
  { invoice: 'BBA-RBI-002', name: 'Shinjini Nath', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-003', name: 'RAGHAV VUTUKURU', batch: '3-Day', amount: 3000 },
  { invoice: 'BBA-RBI-004', name: 'Akshath Manithan', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-005', name: 'Mokshita Ratnala', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-006', name: 'Stuti kumari', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-007', name: 'Aarohi Arya', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-008', name: 'Viraaj Saini', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-009', name: 'Manushree Bhosale', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-010', name: 'Khushi Jain', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-011', name: 'Purva Modi', batch: '3-Day', amount: 3000 },
  { invoice: 'BBA-RBI-012', name: 'Prisha Modi', batch: '3-Day', amount: 3000 },
  { invoice: 'BBA-RBI-013', name: 'AMAY BANSAL', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-014', name: 'Anvika Sangale', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-015', name: 'Prisha Dandaj', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-016', name: 'Mishika Giri', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-017', name: 'Samarth Singh', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-018', name: 'Advik', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-019', name: 'Mahalakshmi', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-020', name: 'Vidyasri', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-021', name: 'Ojaswi Khanna', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-022', name: 'Ayra Khanna', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-023', name: 'Vignyatri', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-024', name: 'Amaira Anant', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-025', name: 'Tanvi Baswaraj Patil', batch: '4-Day', amount: 4000 },
  { invoice: 'BBA-RBI-026', name: 'Ashvath', batch: '3-Day', amount: 3000 },
  { invoice: 'BBA-RBI-027', name: 'Kartik Bachhav', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-028', name: 'Sanchayita', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-029', name: 'Arnav singh yadav', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-030', name: 'Kesav Kalyan Ratnala', batch: '3-Day', amount: 3000 },
  { invoice: 'BBA-RBI-031', name: 'Aaditiya chauhaan', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-032', name: 'Pragyan Dwivedi', batch: '3-Day', amount: 3000 },
  { invoice: 'BBA-RBI-033', name: 'Tishya Bhardwaj', batch: '2-Day', amount: 2000 },
  { invoice: 'BBA-RBI-034', name: 'Namita Santosh Jadhav', batch: '2-Day', amount: 2000 },
];

function normalize(s) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function main() {
  console.log('Looking up RBI Colony centre...');
  const centresSnap = await db.collection('centres').get();
  const centre = centresSnap.docs.find(
    (d) => normalize(d.data().name).includes('rbi')
  );
  if (!centre) {
    console.error('❌ Could not find RBI Colony centre. Available centres:');
    centresSnap.docs.forEach((d) => console.log(`  - ${d.data().name} (${d.id})`));
    process.exit(1);
  }
  const centreId = centre.id;
  console.log(`✅ Found centre: ${centre.data().name} (${centreId})`);

  // Load batches for this centre
  console.log('Loading batches...');
  const batchesSnap = await db.collection('batches').where('centreId', '==', centreId).get();
  const batches = batchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Found ${batches.length} batches:`);
  batches.forEach((b) => console.log(`  - ${b.name} (${b.id})`));

  // Match batch label (2-Day, 3-Day, 4-Day) to actual batch
  function findBatch(label) {
    const dayCount = label.replace('-Day', '');
    // Try matching by name containing the day count
    return batches.find((b) => {
      const name = normalize(b.name);
      return name.includes(dayCount + ' day') || name.includes(dayCount + '-day') ||
             name.includes(dayCount + 'day') || name.includes(label.toLowerCase());
    });
  }

  // Load all students for matching
  console.log('Loading students...');
  const studentsSnap = await db.collection('students')
    .where('primaryCentreId', '==', centreId)
    .get();
  const students = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Found ${students.length} students in RBI Colony`);

  // Also load all students (some might have different centreId)
  const allStudentsSnap = await db.collection('students').get();
  const allStudents = allStudentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  function findStudent(name) {
    const norm = normalize(name);
    // Exact match in centre first
    let match = students.find((s) => normalize(s.name) === norm);
    if (match) return match;
    // Partial match in centre
    match = students.find((s) => normalize(s.name).includes(norm) || norm.includes(normalize(s.name)));
    if (match) return match;
    // Exact match across all students
    match = allStudents.find((s) => normalize(s.name) === norm);
    if (match) return match;
    // Partial match across all students
    match = allStudents.find((s) => normalize(s.name).includes(norm) || norm.includes(normalize(s.name)));
    return match || null;
  }

  // Process each payment
  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const p of PAYMENTS) {
    const student = findStudent(p.name);
    const batch = findBatch(p.batch);

    if (!student) {
      errors.push(`❌ Student not found: "${p.name}" (${p.invoice})`);
      skipped++;
      continue;
    }

    if (!batch) {
      errors.push(`⚠️ Batch not found for "${p.batch}" — using null batchId for ${p.name}`);
    }

    const amountPaise = p.amount * 100;
    const now = new Date().toISOString();

    const doc = {
      studentId: student.id,
      batchId: batch ? batch.id : null,
      centreId: centreId,
      month: MONTH,
      baseAmountPaise: amountPaise,
      gstAmountPaise: 0,
      totalAmountPaise: amountPaise,
      gstRatePercentSnapshot: GST_RATE,
      status: 'PAID',
      method: 'BANK_TRANSFER',
      dueDate: null,
      paidAt: now,
      razorpayOrderId: null,
      razorpayPaymentId: null,
      razorpaySignature: null,
      notes: `UPI payment. Invoice: ${p.invoice}`,
      receiptNumber: p.invoice,
      receiptPdfPath: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: CREATED_BY,
      updatedBy: CREATED_BY,
    };

    await db.collection('payments').add(doc);
    console.log(`✅ ${p.invoice} — ${student.name} (${student.id}) — ₹${p.amount}`);
    created++;
  }

  console.log('\n────────────────────────────────────');
  console.log(`Created: ${created} / ${PAYMENTS.length}`);
  console.log(`Skipped: ${skipped}`);
  if (errors.length > 0) {
    console.log('\nIssues:');
    errors.forEach((e) => console.log(`  ${e}`));
  }
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

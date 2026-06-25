#!/usr/bin/env node

/**
 * One-time script: set centreCode and lastStudentNo on each centre document,
 * and seed the counters/invoices document.
 *
 * Usage:
 *   node scripts/seed-centre-codes.mjs
 *
 * Prerequisites: GOOGLE_APPLICATION_CREDENTIALS env var or `firebase login`.
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'bba-sports-prod';

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

// ── EDIT THESE VALUES ──────────────────────────────────────────────────────
// Map: partial centre name match → { centreCode, lastStudentNo }
const CENTRE_MAP = [
  { match: 'dadar',  centreCode: 'DAD', lastStudentNo: 0 },
  { match: 'rbi',    centreCode: 'RBI', lastStudentNo: 0 },
  { match: 'ruia',   centreCode: 'RUI', lastStudentNo: 0 },
];

// Starting invoice counter (set to highest existing invoice number)
const STARTING_INVOICE_NO = 0;
// ───────────────────────────────────────────────────────────────────────────

function normalize(s) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function main() {
  console.log('Loading centres...');
  const centresSnap = await db.collection('centres').get();

  for (const doc of centresSnap.docs) {
    const data = doc.data();
    const name = normalize(data.name || '');

    const mapping = CENTRE_MAP.find((m) => name.includes(m.match));
    if (!mapping) {
      console.log(`  ⚠️  No mapping for "${data.name}" (${doc.id}) — skipping`);
      continue;
    }

    if (data.centreCode === mapping.centreCode) {
      console.log(`  ✅ "${data.name}" already has centreCode=${mapping.centreCode}`);
      continue;
    }

    await doc.ref.update({
      centreCode: mapping.centreCode,
      lastStudentNo: data.lastStudentNo ?? mapping.lastStudentNo,
    });
    console.log(`  ✅ "${data.name}" → centreCode=${mapping.centreCode}, lastStudentNo=${mapping.lastStudentNo}`);
  }

  // Seed counters/invoices
  const counterRef = db.collection('counters').doc('invoices');
  const counterSnap = await counterRef.get();
  if (counterSnap.exists) {
    console.log(`\n  ℹ️  counters/invoices already exists (lastInvoiceNo=${counterSnap.data().lastInvoiceNo})`);
  } else {
    await counterRef.set({ lastInvoiceNo: STARTING_INVOICE_NO });
    console.log(`\n  ✅ counters/invoices created with lastInvoiceNo=${STARTING_INVOICE_NO}`);
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

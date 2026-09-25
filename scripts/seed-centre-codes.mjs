#!/usr/bin/env node

/**
 * One-time script: set centreCode, lastStudentNo, and lastInvoiceNo on each
 * centre document.
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

// ── Centre data from Google Sheets system ─────────────────────────────────
// Values: { match, centreCode, lastInvoiceNo, lastStudentNo }
// lastInvoiceNo = highest invoice already issued (next will be +1)
// lastStudentNo = highest student number already assigned (next will be +1)
const CENTRE_MAP = [
  { match: 'dadar',   centreCode: 'DAD', lastInvoiceNo: 25, lastStudentNo: 25 },
  { match: 'ruia',    centreCode: 'RUI', lastInvoiceNo: 1,  lastStudentNo: 1 },
  { match: 'rbi',     centreCode: 'RBI', lastInvoiceNo: 34, lastStudentNo: 36 },
  { match: 'bandra',  centreCode: 'BAN', lastInvoiceNo: 0,  lastStudentNo: 0 },
];
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

    const updates = {};
    if (data.centreCode !== mapping.centreCode) {
      updates.centreCode = mapping.centreCode;
    }
    if ((data.lastStudentNo ?? 0) < mapping.lastStudentNo) {
      updates.lastStudentNo = mapping.lastStudentNo;
    }
    if ((data.lastInvoiceNo ?? 0) < mapping.lastInvoiceNo) {
      updates.lastInvoiceNo = mapping.lastInvoiceNo;
    }

    if (Object.keys(updates).length === 0) {
      console.log(`  ✅ "${data.name}" already up to date (${mapping.centreCode})`);
      continue;
    }

    await doc.ref.update(updates);
    console.log(`  ✅ "${data.name}" → code=${mapping.centreCode}, invoices=${mapping.lastInvoiceNo}, students=${mapping.lastStudentNo}`);
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

/**
 * PDF receipt generator. Works for both CASH and RAZORPAY payments — has no
 * Razorpay dependency. Implementation lands in Step 7 using pdfkit; this module exists
 * now so the import graph is stable.
 *
 * Signature is intentionally final: later code only needs to fill the body.
 */

import type { PaymentDocument } from '@bba/shared';

export interface ReceiptRenderInput {
  payment: PaymentDocument;
  student: { id: string; name: string };
  batch: { id: string; name: string };
  centre: {
    id: string;
    name: string;
    address: string;
    city: string;
    pincode: string;
    gstRatePercent: number;
  };
  /** The canonical receipt number (BBA/YYYY-YY/NNNNN). */
  receiptNumber: string;
}

/**
 * Render a GST-compliant coaching fee receipt as a PDF buffer.
 *
 * Step 1: returns an explicit error so callers can see it's not yet implemented.
 * Step 7: will use `pdfkit` to render a branded, GST-compliant document.
 */
export async function renderReceiptPdf(_input: ReceiptRenderInput): Promise<Buffer> {
  throw new Error(
    'renderReceiptPdf not implemented yet — lands in Step 7 (Payment module).',
  );
}

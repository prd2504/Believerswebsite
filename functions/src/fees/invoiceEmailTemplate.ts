const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return ONES[n % 10] ? `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}` : TENS[Math.floor(n / 10)];
}

function threeDigits(n: number): string {
  if (n === 0) return '';
  if (n < 100) return twoDigits(n);
  const rest = twoDigits(n % 100);
  return rest ? `${ONES[Math.floor(n / 100)]} Hundred ${rest}` : `${ONES[Math.floor(n / 100)]} Hundred`;
}

function numberToWordsIndian(n: number): string {
  if (n === 0) return 'Zero';
  n = Math.round(n);
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore > 0) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh > 0) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n > 0) parts.push(threeDigits(n));
  return parts.join(' ');
}

function fmtINR(paise: number): string {
  const rupees = Math.round(paise / 100);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(rupees);
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export interface InvoiceEmailParams {
  studentName: string;
  centreName: string;
  batchName: string;
  month: string;
  externalInvoiceNo: string;
  externalStudentId: string | null;
  baseAmountPaise: number;
  gstAmountPaise: number;
  totalAmountPaise: number;
  gstRatePercent: number;
  paymentMethod: string;
  paymentDate: string | null;
}

export function buildInvoiceHtml(p: InvoiceEmailParams): string {
  const totalRupees = Math.round(p.totalAmountPaise / 100);
  const amountWords = `Indian Rupees ${numberToWordsIndian(totalRupees)} Only`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">

  <!-- Header -->
  <div style="background:#0D1B2A;padding:24px 24px 20px;text-align:center">
    <img src="https://bbashuttle.com/logo.png" alt="BBA Sports" width="120" style="display:block;margin:0 auto 12px;max-width:120px;height:auto" />
    <h2 style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.5px">BBA Sports Private Limited</h2>
    <p style="margin:4px 0 0;font-size:11px;color:#94a3b8">hello@bbashuttle.com</p>
  </div>

  <!-- Doc type bar -->
  <div style="background:#D94F2A;padding:10px 24px;text-align:center">
    <span style="color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px">FEE RECEIPT &mdash; ${monthLabel(p.month).toUpperCase()}</span>
  </div>

  <div style="padding:24px">
    <!-- Invoice info -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#64748b">Invoice No.</td>
        <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;text-align:right">${p.externalInvoiceNo}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#64748b">Date</td>
        <td style="padding:6px 0;font-size:13px;color:#0f172a;text-align:right">${fmtDate(p.paymentDate)}</td>
      </tr>
    </table>

    <!-- Student info -->
    <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#64748b;width:40%">Student</td>
          <td style="padding:4px 0;font-size:13px;font-weight:600;color:#0f172a">${p.studentName}</td>
        </tr>
        ${p.externalStudentId ? `<tr>
          <td style="padding:4px 0;font-size:12px;color:#64748b">Student ID</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a">${p.externalStudentId}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#64748b">Centre</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a">${p.centreName}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#64748b">Batch</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a">${p.batchName}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#64748b">Month</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a">${monthLabel(p.month)}</td>
        </tr>
      </table>
    </div>

    <!-- Amount breakdown -->
    <h3 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;border-left:3px solid #D94F2A;padding-left:10px">Fee Breakdown</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155">Coaching Fee</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;color:#334155">${fmtINR(p.baseAmountPaise)}</td>
      </tr>
      ${p.gstAmountPaise > 0 ? `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155">GST (${p.gstRatePercent}%)</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;color:#334155">${fmtINR(p.gstAmountPaise)}</td>
      </tr>` : ''}
    </table>

    <!-- Total -->
    <div style="background:#0D1B2A;border-radius:8px;padding:16px;text-align:center;margin-bottom:12px">
      <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">Total Paid</p>
      <p style="margin:0;font-size:28px;font-weight:800;color:#ffffff">${fmtINR(p.totalAmountPaise)}</p>
    </div>

    <!-- Amount in words -->
    <div style="background:#f8fafc;border-radius:6px;padding:10px 14px;margin-bottom:20px">
      <p style="margin:0;font-size:12px;color:#64748b;font-style:italic">${amountWords}</p>
    </div>

    <!-- Payment details -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#64748b">Payment Method</td>
        <td style="padding:4px 0;font-size:12px;color:#0f172a;text-align:right">${p.paymentMethod}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#64748b">Status</td>
        <td style="padding:4px 0;font-size:12px;text-align:right"><span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;font-weight:600">PAID</span></td>
      </tr>
    </table>
  </div>

  <!-- Footer -->
  <div style="background:#f8fafc;padding:16px 24px;border-top:1px solid #e2e8f0;text-align:center">
    <p style="margin:0;font-size:10px;color:#94a3b8">This is a system-generated receipt. For queries, contact hello@bbashuttle.com</p>
    <p style="margin:4px 0 0;font-size:10px;color:#94a3b8">BBA Sports Private Limited</p>
  </div>

</div>
</body>
</html>`;
}

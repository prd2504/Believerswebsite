import { logoImg } from './brand.js';
export interface WelcomeEmailParams {
  studentName: string;
  externalStudentId: string | null;
  centreName: string;
  batchName: string;
}

export function buildWelcomeHtml(p: WelcomeEmailParams): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#E84C1E;padding:24px;text-align:center">
    <div style="display:inline-block;margin:0 auto 12px;border-radius:12px;overflow:hidden;line-height:0">${logoImg(68)}</div>
    <h2 style="margin:0;font-size:20px;font-weight:800;color:#fff">Welcome to BBA Sports! 🏸</h2>
  </div>
  <div style="padding:24px">
    <p style="margin:0 0 16px;font-size:15px;color:#0f172a">Hi <strong>${p.studentName}</strong>, your registration is confirmed. We're thrilled to have you on the court!</p>
    <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px">
      <table style="width:100%;border-collapse:collapse">
        ${p.externalStudentId ? `<tr><td style="padding:5px 0;font-size:13px;color:#64748b;width:40%">Student ID</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:#0f172a">${p.externalStudentId}</td></tr>` : ''}
        <tr><td style="padding:5px 0;font-size:13px;color:#64748b">Centre</td><td style="padding:5px 0;font-size:13px;color:#0f172a">${p.centreName}</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#64748b">Batch</td><td style="padding:5px 0;font-size:13px;color:#0f172a">${p.batchName || '—'}</td></tr>
      </table>
    </div>
    <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;color:#0f172a;border-left:3px solid #E84C1E;padding-left:10px">A few quick reminders</h3>
    <ul style="margin:0 0 20px;padding-left:18px;font-size:13px;color:#334155;line-height:1.7">
      <li>Monthly fees are due by the <strong>5th</strong> of each month.</li>
      <li>Please wear <strong>non-marking shoes</strong> on court.</li>
      <li>Arrive <strong>10 minutes early</strong> to warm up.</li>
      <li>Pay fees &amp; manage your account anytime at <a href="https://bbashuttle.com" style="color:#E84C1E;text-decoration:none;font-weight:600">bbashuttle.com</a>.</li>
    </ul>
    <p style="margin:0;font-size:13px;color:#64748b">See you on the court! — Team BBA Sports</p>
  </div>
  <div style="background:#f8fafc;padding:16px 24px;border-top:1px solid #e2e8f0;text-align:center">
    <p style="margin:0;font-size:10px;color:#94a3b8">BBA Sports Private Limited · hello@bbashuttle.com</p>
  </div>
</div></body></html>`;
}

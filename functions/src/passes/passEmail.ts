/**
 * The pass, as an email.
 *
 * Built to be usable WITHOUT tapping the link. Someone standing at a gate with
 * one bar of signal should be able to open the email and show it — so the pass
 * itself is laid out in the message body, not hidden behind a button. The link
 * is there for the live version, which is what actually expires.
 *
 * The layout is deliberately blunt: a full-width colour band carrying the
 * month in the largest type the email will render, the name under it, and the
 * validity date. A guard reading forty of these at 6 AM is looking at the
 * colour and the month word, in that order, and nothing else.
 */

import { logoImg } from '../fees/brand.js';
import type { PassView } from '@bba/shared';

export function buildPassEmail(
  pass: PassView,
  colour: { bg: string; fg: string; name: string },
  url: string,
): string {
  const valid = pass.state === 'VALID';
  // An invalid pass must not look like a pass. Red, and it says so before it
  // says anything else.
  const band = valid ? colour.bg : '#B91C1C';
  const bandFg = valid ? colour.fg : '#FFFFFF';

  const quarterStrip = pass.coversMonths.length > 1
    ? `<p style="margin:10px 0 0;font-size:12px;color:${bandFg};opacity:.85">
         Covers ${pass.coversMonths.length} months · paid in advance
       </p>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:420px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 14px rgba(0,0,0,.1)">

  <div style="background:#0A0A0A;padding:14px 20px">
    <table role="presentation" style="border-collapse:collapse"><tr>
      <td style="padding-right:10px;vertical-align:middle">${logoImg(32)}</td>
      <td style="vertical-align:middle">
        <p style="margin:0;font-size:13px;font-weight:700;color:#fff">BBA SPORTS ACADEMY</p>
        <p style="margin:2px 0 0;font-size:11px;color:#94a3b8">${pass.centreName}</p>
      </td>
    </tr></table>
  </div>

  <!-- The band. Everything a guard needs, in one glance. -->
  <div style="background:${band};padding:26px 20px;text-align:center">
    <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:3px;color:${bandFg};opacity:.8">
      ${valid ? 'ENTRY PASS' : 'NOT VALID'}
    </p>
    <p style="margin:8px 0 0;font-size:30px;font-weight:800;line-height:1.1;color:${bandFg}">
      ${pass.validLabel}
    </p>
    ${quarterStrip}
  </div>

  <div style="padding:22px 20px">
    <p style="margin:0;font-size:11px;letter-spacing:1.5px;color:#94a3b8;text-transform:uppercase">Name</p>
    <p style="margin:3px 0 16px;font-size:24px;font-weight:700;color:#0A0A0A;line-height:1.2">
      ${pass.personName}
    </p>

    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr>
        <td style="padding:7px 0;color:#64748b;width:40%;border-top:1px solid #e2e8f0">Validity</td>
        <td style="padding:7px 0;font-weight:600;color:${valid ? '#0A0A0A' : '#B91C1C'};border-top:1px solid #e2e8f0">
          ${pass.validUntilLabel}
        </td>
      </tr>
      ${pass.reasonLabel ? `<tr>
        <td style="padding:7px 0;color:#64748b;border-top:1px solid #e2e8f0">Type</td>
        <td style="padding:7px 0;color:#0A0A0A;border-top:1px solid #e2e8f0">${pass.reasonLabel}</td>
      </tr>` : ''}
      <tr>
        <td style="padding:7px 0;color:#64748b;border-top:1px solid #e2e8f0">Pass code</td>
        <td style="padding:7px 0;font-family:monospace;font-weight:700;color:#0A0A0A;border-top:1px solid #e2e8f0">
          ${pass.code}
        </td>
      </tr>
    </table>

    ${pass.message ? `<div style="margin-top:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px">
      <p style="margin:0;font-size:13px;color:#991b1b">${pass.message}</p>
    </div>` : ''}

    <a href="${url}" style="display:block;margin-top:18px;background:#0A0A0A;color:#fff;text-align:center;
       padding:13px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none">
      Open live pass
    </a>
    <p style="margin:10px 0 0;font-size:11px;color:#94a3b8;line-height:1.6;text-align:center">
      Show this at the gate. The live pass always shows your current status &mdash;
      open it if you have signal, or show this email if you don&rsquo;t.
      You can also print it from the live pass.
    </p>
  </div>
</div>
</body></html>`;
}

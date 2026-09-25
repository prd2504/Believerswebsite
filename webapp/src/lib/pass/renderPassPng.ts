/**
 * Draw a pass onto a canvas and hand it back as a PNG.
 *
 * ── Why canvas rather than a PDF library ──
 * A pass gets sent on WhatsApp far more often than it gets printed, and an
 * image is what WhatsApp actually wants — a PDF arrives as a document nobody
 * opens on a phone. An image also prints perfectly well, which a document
 * viewer is not required for.
 *
 * Drawing it by hand rather than screenshotting the DOM avoids pulling in
 * html2canvas (~200KB) for one button, and avoids its habit of rendering
 * subtly differently from the page it copied.
 *
 * Rendered at 2× so it stays sharp when printed or pinched-to-zoom.
 */

import type { PassPayload } from './types';

const SCALE = 2;
const W = 620;

/** Fixed vertical anchors — everything below the name grows with content. */
const BAND_BOTTOM = 300;
const NAME_LABEL_Y = 348;
const ROW_H = 44;
const FOOTER_H = 64;

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shrink the font until the text fits, rather than letting it run off the card. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, start: number, weight = '700'): number {
  let size = start;
  do {
    ctx.font = `${weight} ${size}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    if (ctx.measureText(text).width <= maxW) break;
    size -= 2;
  } while (size > 12);
  return size;
}

function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Same origin, so the canvas is never tainted and toBlob keeps working.
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);   // a missing logo must not block a pass
    img.src = '/logo.png';
  });
}

export async function renderPassPng(
  pass: PassPayload,
  colour: { bg: string; fg: string },
): Promise<Blob | null> {
  // Rows and the name's font size both vary, and a canvas cannot be resized
  // after drawing without clearing it — so measure first on a throwaway
  // context, then size the real one to fit. Fixing the height instead left a
  // third of the card blank on a two-row pass, which looks like a rendering
  // fault rather than a design.
  const rows: [string, string][] = [['Validity', pass.validUntilLabel]];
  if (pass.reasonLabel) rows.push(['Type', pass.reasonLabel]);
  rows.push(['Pass code', pass.code]);

  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) return null;
  const nameSize = fitText(measure, pass.personName, W - 72, 40);
  const H = NAME_LABEL_Y + nameSize + 52 + rows.length * ROW_H + 20 + FOOTER_H;

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);

  const valid = pass.state === 'VALID';
  const upcoming = pass.state === 'UPCOMING';
  const band = valid ? colour.bg : upcoming ? '#334155' : '#B91C1C';
  const bandFg = valid || upcoming ? colour.fg : '#FFFFFF';

  // Card
  ctx.fillStyle = '#FFFFFF';
  rounded(ctx, 0, 0, W, H, 24);
  ctx.fill();

  // Academy strip
  ctx.fillStyle = '#0A0A0A';
  ctx.save();
  rounded(ctx, 0, 0, W, H, 24);
  ctx.clip();
  ctx.fillRect(0, 0, W, 86);

  const logo = await loadLogo();
  let textX = 32;
  if (logo) {
    ctx.drawImage(logo, 32, 22, 42, 42);
    textX = 88;
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 17px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('BBA SPORTS ACADEMY', textX, 44);
  ctx.fillStyle = '#94A3B8';
  ctx.font = '400 14px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(pass.centreName, textX, 66);

  // The band — the thing a guard reads
  ctx.fillStyle = band;
  ctx.fillRect(0, 86, W, BAND_BOTTOM - 86);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = bandFg;
  ctx.globalAlpha = 0.85;
  ctx.font = '700 15px -apple-system, "Segoe UI", Roboto, sans-serif';
  const headline = pass.state === 'VALID' ? 'ENTRY PASS'
    : pass.state === 'UPCOMING' ? 'NOT YET ACTIVE'
      : pass.state === 'PENDING' ? 'AWAITING APPROVAL'
        : pass.state === 'REJECTED' ? 'DECLINED' : 'NOT VALID';
  ctx.fillText(headline.split('').join(' '), W / 2, 140);
  ctx.globalAlpha = 1;

  const bigSize = fitText(ctx, pass.validLabel, W - 64, 54, '800');
  ctx.font = `800 ${bigSize}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(pass.validLabel, W / 2, 215);

  // Quarterly strip
  if (pass.coversMonths.length > 1) {
    ctx.font = '600 15px -apple-system, "Segoe UI", Roboto, sans-serif';
    const chips = pass.coversMonths.map(monthChip);
    const gap = 10;
    const widths = chips.map((c) => ctx.measureText(c).width + 22);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (chips.length - 1);
    let x = (W - total) / 2;
    chips.forEach((c, i) => {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = bandFg;
      rounded(ctx, x, 248, widths[i], 30, 15);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (pass.coversMonths[i] === pass.colourMonth) {
        ctx.strokeStyle = bandFg;
        ctx.lineWidth = 2;
        rounded(ctx, x, 248, widths[i], 30, 15);
        ctx.stroke();
      }
      ctx.fillStyle = bandFg;
      ctx.fillText(c, x + widths[i] / 2, 269);
      x += widths[i] + gap;
    });
  }

  // Name
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 13px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('NAME', 36, NAME_LABEL_Y);
  ctx.font = `700 ${nameSize}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = '#0A0A0A';
  ctx.fillText(pass.personName, 36, NAME_LABEL_Y + nameSize + 8);

  // Details
  let y = NAME_LABEL_Y + nameSize + 52;

  rows.forEach(([label, value]) => {
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(36, y);
    ctx.lineTo(W - 36, y);
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = '400 15px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(label, 36, y + 28);

    ctx.textAlign = 'right';
    ctx.fillStyle = label === 'Validity' && !valid && !upcoming ? '#B91C1C' : '#0A0A0A';
    const vSize = fitText(ctx, value, W - 210, 15, '600');
    ctx.font = `600 ${vSize}px ${label === 'Pass code' ? 'monospace' : '-apple-system, "Segoe UI", Roboto, sans-serif'}`;
    ctx.fillText(value, W - 36, y + 28);
    ctx.textAlign = 'left';
    y += 44;
  });

  // Footer instruction — on the printed card, where the guard will see it
  ctx.fillStyle = '#F8FAFC';
  ctx.save();
  rounded(ctx, 0, 0, W, H, 24);
  ctx.clip();
  ctx.fillRect(0, H - FOOTER_H, W, FOOTER_H);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748B';
  ctx.font = '400 13px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Admit only if the colour band matches the current month.', W / 2, H - 26);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

const ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthChip(ym: string): string {
  return `${ABBR[Number(ym.slice(5, 7)) - 1] ?? ''} ${ym.slice(2, 4)}`;
}

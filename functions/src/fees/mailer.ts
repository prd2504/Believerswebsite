import nodemailer from 'nodemailer';

/** Shared SMTP sender. No-ops (logs only) when SMTP isn't configured. */
export async function sendMail(opts: { to: string; subject: string; html: string; cc?: string }): Promise<void> {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM ?? 'BBA Sports Academy <hello@bbashuttle.com>';

  if (!host || !user || !pass) {
    console.log('[mailer] SMTP not configured — skipping send', { to: opts.to, subject: opts.subject });
    return;
  }
  const portNum = Number(port ?? '465');
  const transporter = nodemailer.createTransport({
    host, port: portNum, secure: portNum === 465, auth: { user, pass },
  });
  await transporter.sendMail({ from, to: opts.to, cc: opts.cc, subject: opts.subject, html: opts.html });
}

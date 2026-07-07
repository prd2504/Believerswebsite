import nodemailer from 'nodemailer';

export interface SendMailResult {
  messageId: string;
  /** Recipients the SMTP server accepted for relay. */
  accepted: string[];
  /** Recipients the SMTP server rejected outright (bad address etc). */
  rejected: string[];
  /** Raw SMTP response line, e.g. "250 2.0.0 OK: queued as ...". */
  response: string;
}

/**
 * Shared SMTP sender. No-ops (logs only) when SMTP isn't configured.
 *
 * IMPORTANT — what "success" here actually means: a resolved promise only
 * confirms smtp.hostinger.com ACCEPTED the message for relay (SMTP 250 OK).
 * It is not proof the recipient's inbox received it — the receiving server
 * can still bounce it afterward or route it to spam, silently, after this
 * call has already returned. Treat `accepted`/`rejected` as the strongest
 * per-recipient signal this call site can give; for true delivery
 * confirmation, check the hello@bbashuttle.com Sent/Bounce folders directly.
 */
export async function sendMail(opts: { to: string; subject: string; html: string; cc?: string }): Promise<SendMailResult | null> {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM ?? 'BBA Sports Academy <hello@bbashuttle.com>';

  if (!host || !user || !pass) {
    console.log('[mailer] SMTP not configured — skipping send', { to: opts.to, subject: opts.subject });
    return null;
  }
  const portNum = Number(port ?? '465');
  const transporter = nodemailer.createTransport({
    host, port: portNum, secure: portNum === 465, auth: { user, pass },
  });
  const info = await transporter.sendMail({ from, to: opts.to, cc: opts.cc, subject: opts.subject, html: opts.html });
  return {
    messageId: info.messageId ?? '',
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
    response: info.response ?? '',
  };
}

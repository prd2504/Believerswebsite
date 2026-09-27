/**
 * Drop-in route for the JarvisOS relay: POST /notify-jaydeep
 * ---------------------------------------------------------------------------
 * This file does NOT run here. It belongs in the JarvisOS repo's server.js —
 * it lives in this repo so the two halves of the contract stay in one place,
 * because the caller (functions/src/slots/onCourtBookingCreated.ts) and this
 * route have to agree on the header name, the body shape and the secret.
 *
 * Contract, as the caller sends it:
 *
 *   POST <JARVIS_NOTIFY_URL>
 *   x-jarvis-secret: <JARVIS_NOTIFY_SECRET>
 *   { "to": "jaydeep", "text": "…", "source": "court-booking" }
 *
 * The caller treats every failure as non-fatal: a booking is never rolled back
 * because a Telegram message did not send. So this route can fail loudly
 * without risking a lost booking — but it should still return quickly, since
 * the caller gives it a 10s timeout.
 *
 * Install:
 *   1. Paste this into JarvisOS server.js (or require it and call
 *      installNotifyRoute(app)).
 *   2. Set JARVIS_NOTIFY_SECRET there, and set the same value plus
 *      JARVIS_NOTIFY_URL on the Firebase functions:
 *        firebase functions:secrets:set JARVIS_NOTIFY_SECRET
 *      then add JARVIS_NOTIFY_URL to functions' .env and redeploy.
 *   3. Set TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_JAYDEEP, TELEGRAM_CHAT_OWNER.
 */

const RECIPIENTS = {
  // Both people get court bookings — Jaydeep runs the court, the owner wants
  // the money trail. Add a key here rather than teaching the caller about
  // chat ids: the caller only ever says who, never where.
  jaydeep: () => [process.env.TELEGRAM_CHAT_JAYDEEP, process.env.TELEGRAM_CHAT_OWNER],
  owner: () => [process.env.TELEGRAM_CHAT_OWNER],
};

/**
 * Fixed-window limiter, per source.
 *
 * The endpoint is authenticated, so this is not the main line of defence — it
 * is a blast radius cap. If a Firestore trigger ever retry-loops on a bad
 * document, the failure mode without this is Jaydeep's phone buzzing several
 * hundred times before anyone notices.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const buckets = new Map();

function overLimit(key) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start > WINDOW_MS) {
    buckets.set(key, { start: now, count: 1 });
    return false;
  }
  b.count += 1;
  return b.count > MAX_PER_WINDOW;
}

/**
 * Constant-time compare, so the secret cannot be recovered a byte at a time
 * from response timing. Node's timingSafeEqual throws on length mismatch, so
 * the lengths are compared first — that leaks only the length, which is not
 * usefully secret.
 */
function secretMatches(given, expected) {
  if (typeof given !== 'string' || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return require('node:crypto').timingSafeEqual(a, b);
}

async function sendTelegram(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return { ok: false, reason: 'not configured' };
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // No parse_mode: booking text contains user-supplied names, and a name
    // with an underscore or asterisk in it would either break the message or
    // silently swallow characters under Markdown.
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(8000),
  });
  return { ok: res.ok, status: res.status };
}

function installNotifyRoute(app) {
  app.post('/notify-jaydeep', async (req, res) => {
    if (!secretMatches(req.get('x-jarvis-secret'), process.env.JARVIS_NOTIFY_SECRET)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const { to = 'jaydeep', text, source = 'unknown' } = req.body ?? {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'text required' });
    }
    if (overLimit(source)) {
      console.warn('[notify] rate limited', { source });
      return res.status(429).json({ ok: false, error: 'rate limited' });
    }

    const chatIds = (RECIPIENTS[to] ?? RECIPIENTS.jaydeep)().filter(Boolean);
    if (chatIds.length === 0) {
      return res.status(500).json({ ok: false, error: 'no chat ids configured' });
    }

    // Telegram caps a message at 4096 characters. Truncate rather than fail —
    // a clipped booking alert is still an alert.
    const body = text.length > 4000 ? `${text.slice(0, 3990)}\n…` : text;

    const results = await Promise.allSettled(chatIds.map((id) => sendTelegram(id, body)));
    const delivered = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
    if (delivered === 0) {
      console.error('[notify] all sends failed', { source, results });
      return res.status(502).json({ ok: false, error: 'delivery failed' });
    }
    return res.json({ ok: true, delivered, of: chatIds.length });
  });
}

module.exports = { installNotifyRoute };

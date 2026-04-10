/**
 * WhatsApp Business API sender. Gated by WHATSAPP_LIVE.
 *
 * Step 1: signature and guard in place, real call implemented but won't fire until the
 * flag is true. This lets later code (payment reminders, absence alerts, broadcasts)
 * import and call this module today without breaking anything at runtime.
 */

import { logger } from 'firebase-functions';
import { config, requireSecret } from '../config.js';

/** Thrown when the WhatsApp feature flag is off. Callers should handle gracefully. */
export class WhatsAppDisabledError extends Error {
  constructor() {
    super('WhatsApp is disabled (WHATSAPP_LIVE=false). Set the flag and secrets to activate.');
    this.name = 'WhatsAppDisabledError';
  }
}

export interface SendTemplateInput {
  /** Recipient phone in E.164 format, e.g. "+919876543210". */
  to: string;
  /** Template name as registered with Meta / WhatsApp Business. */
  templateName: string;
  /** Language code, usually "en" or "en_IN". */
  languageCode: string;
  /** Body parameters — positional strings that fill the {{1}}, {{2}} slots in the template. */
  bodyParameters?: string[];
}

/**
 * Send a pre-approved WhatsApp template message. No-op + error when the flag is off.
 */
export async function sendTemplateMessage(input: SendTemplateInput): Promise<{ messageId: string }> {
  if (!config.flags.whatsappLive) throw new WhatsAppDisabledError();

  const token = requireSecret(config.whatsapp.apiToken, 'WHATSAPP_API_TOKEN');
  const phoneNumberId = requireSecret(config.whatsapp.phoneNumberId, 'WHATSAPP_PHONE_NUMBER_ID');

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: input.to,
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      components: input.bodyParameters
        ? [
            {
              type: 'body',
              parameters: input.bodyParameters.map((text) => ({ type: 'text', text })),
            },
          ]
        : [],
    },
  };

  logger.info('[whatsapp] sendTemplateMessage', { to: input.to, template: input.templateName });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp send failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as {
    messages?: Array<{ id: string }>;
  };
  const messageId = data.messages?.[0]?.id ?? 'unknown';
  return { messageId };
}

/**
 * Convenience: if the flag is off, swallow the error and log instead of throwing. Used
 * by best-effort senders like the 3-consecutive-miss alert, where the academy's workflow
 * does not grind to a halt if WhatsApp is unavailable.
 */
export async function sendTemplateBestEffort(input: SendTemplateInput): Promise<void> {
  try {
    await sendTemplateMessage(input);
  } catch (err) {
    if (err instanceof WhatsAppDisabledError) {
      logger.info('[whatsapp] feature disabled — skipping send', { to: input.to });
      return;
    }
    logger.error('[whatsapp] send failed', { err, to: input.to });
  }
}

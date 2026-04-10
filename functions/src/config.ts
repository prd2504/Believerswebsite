/**
 * Centralised runtime config for Cloud Functions. All secrets and feature flags flow
 * through this module so consumer code never reads process.env directly.
 *
 * When any flag is flipped in `functions/.env` (or via `firebase functions:config:set`),
 * redeploy the functions and the feature activates — no code edits required.
 */

function readEnv(key: string, fallback: string | null = null): string | null {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v;
}

function readBoolEnv(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return v.toLowerCase() === 'true' || v === '1';
}

export const config = {
  /** Feature flags — the backend half of the paired webapp/functions toggles. */
  flags: {
    razorpayLive: readBoolEnv('RAZORPAY_LIVE', false),
    whatsappLive: readBoolEnv('WHATSAPP_LIVE', false),
  },

  /** Razorpay secrets. Nullable until the company's current account is operational. */
  razorpay: {
    keyId: readEnv('RAZORPAY_KEY_ID'),
    keySecret: readEnv('RAZORPAY_KEY_SECRET'),
    webhookSecret: readEnv('RAZORPAY_WEBHOOK_SECRET'),
  },

  /** Anthropic Claude — used by the progress report generator. */
  anthropic: {
    apiKey: readEnv('ANTHROPIC_API_KEY'),
    modelId: readEnv('CLAUDE_MODEL_ID', 'claude-sonnet-4-6') ?? 'claude-sonnet-4-6',
  },

  /** WhatsApp Business API — for templated messages. */
  whatsapp: {
    apiToken: readEnv('WHATSAPP_API_TOKEN'),
    phoneNumberId: readEnv('WHATSAPP_PHONE_NUMBER_ID'),
    businessAccountId: readEnv('WHATSAPP_BUSINESS_ACCOUNT_ID'),
  },

  logLevel: readEnv('LOG_LEVEL', 'info') ?? 'info',
} as const;

/**
 * Throws if a required secret is missing. Use inside a handler that depends on the
 * secret — that way functions without the secret remain deployable while only the
 * dependent handlers fail at invocation time.
 */
export function requireSecret<T>(value: T | null, name: string): T {
  if (value === null || value === undefined || value === '') {
    throw new Error(
      `[config] Required secret "${name}" is not set. Add it to functions/.env and redeploy.`,
    );
  }
  return value;
}

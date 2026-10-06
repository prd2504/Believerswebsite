/**
 * Read and validate frontend environment variables. Every VITE_ variable funnels through
 * this module — components and services should import `env` instead of touching
 * `import.meta.env` directly.
 *
 * Why: one consistent place to crash-early on misconfiguration, and one consistent place
 * to list every flag that exists.
 */

function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `[env] Missing required env var "${key}". Copy webapp/.env.example to webapp/.env and fill it in.`,
    );
  }
  return value;
}

function optionalEnv(key: string, fallback = ''): string {
  const value = import.meta.env[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function boolEnv(key: string, fallback = false): boolean {
  const value = import.meta.env[key];
  if (typeof value !== 'string') return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

export const env = {
  firebase: {
    apiKey: requireEnv('VITE_FIREBASE_API_KEY'),
    authDomain: requireEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: requireEnv('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: requireEnv('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: requireEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: requireEnv('VITE_FIREBASE_APP_ID'),
    measurementId: optionalEnv('VITE_FIREBASE_MEASUREMENT_ID'),
  },
  flags: {
    razorpayLive: boolEnv('VITE_RAZORPAY_LIVE', false),
    whatsappLive: boolEnv('VITE_WHATSAPP_LIVE', false),
  },
  razorpay: {
    keyId: optionalEnv('VITE_RAZORPAY_KEY_ID'),
  },
  functionsRegion: optionalEnv('VITE_FUNCTIONS_REGION', 'asia-south1'),
} as const;

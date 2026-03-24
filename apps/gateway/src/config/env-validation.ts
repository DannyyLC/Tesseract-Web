/**
 * Validates required environment variables before the application starts.
 *
 * - Variables in REQUIRED_ALWAYS crash the app in ALL environments (dev + prod).
 * - Variables in REQUIRED_IN_PRODUCTION crash the app only when NODE_ENV=production.
 *
 * Variables with sensible code-level defaults (timeouts, model names, expiry strings)
 * are intentionally excluded — they degrade gracefully without explicit configuration.
 */

// ─── Always required ──────────────────────────────────────────────────────────

const REQUIRED_ALWAYS: string[] = [
  // Database
  'DATABASE_URL',

  // JWT — auth won't work at all without these
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'TEMP_TOKEN_SECRET',
];

// ─── Required in production ───────────────────────────────────────────────────

const REQUIRED_IN_PRODUCTION: string[] = [
  // Auth & security
  'TURNSTILE_SECRET_KEY',

  // URLs
  'FRONTEND_URL',
  'DOMAIN_BASE_URL',
  'AGENTS_API_URL',

  // Stripe billing
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_STARTER',
  'STRIPE_PRICE_GROWTH',
  'STRIPE_PRICE_BUSINESS',
  'STRIPE_PRICE_PRO',
  'STRIPE_PRICE_OVERAGE',

  // Email / SMTP
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_EMAIL_FROM',
  'SMTP_VERIFIED_EMAIL_FROM',
  'SMTP_TOKEN_FOR_VERIFICATION',

  // Google OAuth (login con Google)
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALLBACK_URL',

  // GCP Cloud KMS (cifrado de tokens OAuth de integraciones)
  'GCP_PROJECT_ID',
  'GCP_KMS_LOCATION',
  'GCP_KMS_KEY_RING',
  'GCP_KMS_CRYPTO_KEY',

  // Media processing (STT + OCR)
  'MEDIA_PROCESSING_API_BASE_URL',
  'MEDIA_PROCESSING_API_KEY',

  // Conversation compaction
  'COMPACTION_API_BASE_URL',
  'COMPACTION_API_KEY',

  // WhatsApp (YCloud)
  'Y_CLOUD_API_KEY',
  'Y_CLOUD_WEBHOOK_SECRET',
];

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateEnv(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const toCheck = isProduction
    ? [...REQUIRED_ALWAYS, ...REQUIRED_IN_PRODUCTION]
    : REQUIRED_ALWAYS;

  const missing = toCheck.filter((key) => !process.env[key]);

  if (missing.length === 0) return;

  console.error('\nMissing required environment variables:\n');
  missing.forEach((key) => console.error(`    - ${key}`));
  console.error(
    isProduction
      ? '\nSet these variables in GCP Secret Manager and redeploy.\n'
      : '\nCopy .env.example to .env and fill in the missing values.\n',
  );
  process.exit(1);
}

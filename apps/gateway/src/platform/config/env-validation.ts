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
  'AGENTS_INTERNAL_SECRET',
  // Firma los tokens con los que la tool de catálogos consulta al Gateway. Distinto de
  // AGENTS_INTERNAL_SECRET a propósito, y solo aquí: el servicio de agentes recibe esos tokens,
  // nunca los emite, y compartir la llave le daría poder para firmarse cualquier catálogo.
  'DATASET_TOKEN_SECRET',

  // URLs
  'FRONTEND_URL',
  'DOMAIN_BASE_URL',
  'AGENTS_GRPC_URL',
  // URL con la que el servicio de agentes alcanza al Gateway para consultar datasets.
  'GATEWAY_INTERNAL_URL',

  // Stripe billing.
  // Los Price IDs ya no son variables de entorno: el gateway los resuelve por lookup key
  // contra la API de Stripe, así que cambiar un precio no requiere redeploy. El catálogo se
  // administra con `pnpm stripe:catalog`.
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',

  // Email / SMTP
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_EMAIL_FROM',
  'SUPPORT_EMAIL_TO',

  // Google OAuth (login con Google)
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALLBACK_URL',

  // Booking (agenda propia). La service account del Gateway suplanta a esta cuenta de Workspace
  // por domain-wide delegation; sin ella no hay calendario que consultar y el widget de soporte
  // responde 503.
  'BOOKING_IMPERSONATED_USER',

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

  // Upstash Redis (WhatsApp message window aggregation)
  'REDIS_URL',

  // Cloud Tasks (procesamiento diferido de los webhooks de WhatsApp)
  'GCP_TASKS_LOCATION',
  'GCP_TASKS_QUEUE',
  'GCP_TASKS_SERVICE_ACCOUNT',
  'GCP_TASKS_WORKER_BASE_URL',
];

// ─── Requeridas en producción solo si el CFDI está habilitado ────────────────

/**
 * Facturación fiscal (CFDI). El PAC que timbra ante el SAT, el bucket donde se guardan los XML
 * —que hay que conservar cinco años— y a dónde llega el aviso cuando el barrido nocturno no
 * consigue timbrar. La llave decide el entorno: `sk_test_` opera contra el sandbox, `sk_live_`
 * emite CFDI reales y consume timbres de pago.
 *
 * Van aparte porque la facturación se puede apagar entera con `CFDI_ENABLED=false` mientras se
 * cambia de proveedor. Apagada, exigirlas dejaría el gateway sin arrancar por una funcionalidad
 * que nadie va a usar; encendida, siguen siendo obligatorias como cualquier otra.
 */
const REQUIRED_IN_PRODUCTION_CFDI: string[] = [
  'FACTURAPI_API_KEY',
  'CFDI_STORAGE_BUCKET',
  'BILLING_ALERTS_EMAIL',
];

// ─── Opcionales (documentadas) ──────────────────────────────────────────────
// SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD / SUPER_ADMIN_NAME:
//   Si se definen, SuperAdminBootstrapService crea/actualiza el super admin al
//   arrancar. Si faltan, simplemente no se hace nada — por eso NO son
//   obligatorias (no romper entornos existentes). Ver .env.example.
// BOOKING_CALENDAR_ID:
//   Calendario del usuario suplantado donde se crean los eventos. Por defecto "primary".
// BOOKING_AVAILABILITY_GROUP_EMAIL:
//   Google Group del equipo de soporte. Si se define, su disponibilidad se cruza con la del
//   calendario destino y se le invita a cada evento. Vacío = solo cuenta el calendario destino.
// BOOKING_SERVICE_ACCOUNT_EMAIL:
//   Solo para desarrollo local: con ADC de usuario no hay `client_email` que descubrir en el
//   metadata server. En Cloud Run se deduce solo.

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateEnv(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const cfdiEnabled = process.env.CFDI_ENABLED !== 'false';

  const toCheck = isProduction
    ? [
        ...REQUIRED_ALWAYS,
        ...REQUIRED_IN_PRODUCTION,
        ...(cfdiEnabled ? REQUIRED_IN_PRODUCTION_CFDI : []),
      ]
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

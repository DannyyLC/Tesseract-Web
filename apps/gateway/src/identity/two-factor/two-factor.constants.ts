/**
 * Emisor que aparece en la app del autenticador (Google Authenticator, Authy, 1Password...).
 * Junto con el email del usuario forma la etiqueta `Tesseract: usuario@dominio.com`.
 */
export const TOTP_ISSUER = 'Tesseract';

/**
 * Tolerancia de la verificación TOTP, en pasos de 30s a cada lado del actual.
 * Con 1 se aceptan códigos de hasta 30s de antigüedad o adelanto, que es lo que
 * hace falta para absorber el desfase de reloj típico de un teléfono.
 */
export const TOTP_WINDOW = 1;

/** Duración de un paso TOTP en segundos (valor estándar, el que asumen todas las apps). */
export const TOTP_PERIOD = 30;

/** Tamaño del secreto en bytes. 20 bytes = 32 caracteres en base32, igual que el que emitía speakeasy. */
export const TOTP_SECRET_BYTES = 20;

/** Cuántos códigos de respaldo se emiten de golpe. */
export const BACKUP_CODE_COUNT = 10;

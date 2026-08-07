/**
 * Enmascara un email para los logs.
 *
 * Los logs de autenticación son la forma de detectar accesos indebidos, así que la
 * identidad no puede desaparecer del todo — pero el email completo es un dato
 * personal que no tiene por qué quedar en texto plano en disco ni en Cloud Logging.
 * El enmascarado conserva lo suficiente para reconocer una cuenta conocida sin
 * exponerla.
 *
 *   persona@ejemplo.com -> p***a@ejemplo.com
 *   ab@x.com            -> a***@x.com
 *   (vacío / inválido)  -> <sin email>
 */
export function maskEmail(email?: string | null): string {
  if (!email || typeof email !== 'string') return '<sin email>';

  const at = email.lastIndexOf('@');
  if (at <= 0) return '<email inválido>';

  const local = email.slice(0, at);
  const domain = email.slice(at);

  if (local.length <= 2) return `${local[0]}***${domain}`;
  return `${local[0]}***${local[local.length - 1]}${domain}`;
}

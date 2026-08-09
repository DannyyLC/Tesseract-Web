/**
 * Enmascara un número de teléfono para los logs.
 *
 * Mismo criterio que `maskEmail`: los logs del pipeline de mensajería son la forma de
 * entender por qué un mensaje no llegó, así que la identidad no puede desaparecer del
 * todo — pero el número de un cliente es un dato personal que no tiene por qué quedar
 * en texto plano en Cloud Logging, donde lo lee cualquiera con Logs Viewer.
 *
 * Se conservan los dos primeros dígitos y los últimos cuatro. El enmascarado es
 * determinista: si conoces el número, puedes calcular su forma enmascarada y seguir
 * buscándolo en los logs.
 *
 *   +5215512345678 -> +52*******5678
 *   5512345678     -> 55****5678
 *   +52 55 1234    -> +52**1234
 *   +52 1234       -> +******
 *   (vacío)        -> <sin número>
 *
 * Ojo: esto es para logs, no para almacenamiento. El número real se guarda en la
 * conversación, que es donde hay que consultarlo.
 */

/** Dígitos iniciales que se conservan: bastan para distinguir el país de origen. */
const PREFIX_LENGTH = 2;
/** Dígitos finales que se conservan: es como la gente identifica su propio número. */
const TAIL_LENGTH = 4;

export function maskPhone(phone?: string | null): string {
  if (!phone || typeof phone !== 'string') return '<sin número>';

  const trimmed = phone.trim();
  if (trimmed.length === 0) return '<sin número>';

  const plus = trimmed.startsWith('+') ? '+' : '';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 0) return '<número inválido>';

  // Sin dígitos de sobra entre el prefijo y la cola, conservar ambos equivaldría a
  // publicar el número entero. En ese caso se oculta completo: es preferible perder
  // el dato a filtrarlo creyendo que está enmascarado.
  if (digits.length <= PREFIX_LENGTH + TAIL_LENGTH) return `${plus}${'*'.repeat(digits.length)}`;

  const prefix = digits.slice(0, PREFIX_LENGTH);
  const tail = digits.slice(-TAIL_LENGTH);
  const hidden = '*'.repeat(digits.length - PREFIX_LENGTH - TAIL_LENGTH);

  return `${plus}${prefix}${hidden}${tail}`;
}

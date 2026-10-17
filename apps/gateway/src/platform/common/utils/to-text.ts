/**
 * Convierte un valor de origen JSON (variables de la conversación, parámetros de acciones,
 * metadatos de log) en texto.
 *
 * Igual que `String()` salvo en dos casos, y a propósito: un objeto sale como JSON en vez de
 * "[object Object]", y `null`/`undefined` salen como '' en vez de "null"/"undefined" —que
 * antes, por ejemplo, terminaban usándose como si fueran una URL.
 */
export function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(toText).join(',');
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'symbol') return value.toString();
  return ''; // funciones: no son valores de origen JSON
}

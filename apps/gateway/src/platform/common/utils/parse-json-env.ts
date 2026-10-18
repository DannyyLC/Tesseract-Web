/**
 * Lee una variable de entorno con un objeto JSON (p.ej. `{"reasoning_effort":"none"}`).
 *
 * Vacía o ausente = `{}`. Si trae algo que no es un objeto JSON, LANZA: se llama al construir el
 * servicio, así que el gateway no arranca y Cloud Run deja sirviendo la revisión anterior, en
 * lugar de mandar al proveedor una configuración que nadie pidió o ignorarla en silencio.
 */
export function parseJsonObjectEnv(name: string, raw: string | undefined): Record<string, unknown> {
  const text = raw?.trim();
  if (!text) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${name} no es JSON válido: ${text}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${name} debe ser un objeto JSON, p.ej. {"reasoning_effort":"none"}`);
  }
  return parsed as Record<string, unknown>;
}

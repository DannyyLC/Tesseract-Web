/**
 * Tamaños de página de la plataforma.
 *
 * Viven aquí, y no como una constante por pantalla, porque antes el número aparecía suelto en una
 * veintena de sitios entre el Gateway y el front: cambiar "cuántas filas se ven" obligaba a
 * encontrarlos todos y acertar en los dos lados.
 */

/**
 * Tamaño con el que arranca todo listado paginado, en el panel de usuario y en el de super admin, y
 * default de los controladores del Gateway.
 *
 * 20 llena una pantalla normal sin dejar hueco muerto y sigue siendo una sola consulta barata. Es
 * también el default del servidor a propósito: una pantalla que no manda `pageSize` recibe lo mismo
 * que las demás, en vez de caer en un número distinto según el endpoint que le toque.
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Techo de lo que se acepta por HTTP en `?limit=` o `?pageSize=`.
 *
 * No es una preferencia de interfaz: es lo que impide que un `?limit=100000` convierta un listado en
 * un volcado de tabla. Va en la validación, nunca como valor por defecto.
 */
export const MAX_PAGE_SIZE = 100;

/**
 * Tamaños que la persona puede elegir en el selector de un listado.
 *
 * Cada equipo aguanta cosas distintas: 10 para pantallas o dispositivos justos, 100 para barrer un
 * listado sin cambiar de página. El último coincide con `MAX_PAGE_SIZE`, así que ninguna opción
 * puede ser rechazada por el servidor.
 */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

/**
 * Convierte una entrada no confiable (localStorage, query string, lo que sea) en un tamaño de página
 * permitido. Solo acepta un entero que esté en `PAGE_SIZE_OPTIONS`; cualquier otra cosa cae a
 * `DEFAULT_PAGE_SIZE`. Acepta número o cadena de dígitos ("50"), pero no notación científica ni
 * espacios ("1e2", " 50 ").
 */
export function sanitizePageSize(value: unknown): PageSizeOption {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? (parsed as PageSizeOption) : DEFAULT_PAGE_SIZE;
}

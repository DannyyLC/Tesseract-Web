/**
 * Tamaños de página de la plataforma.
 *
 * Viven aquí, y no como una constante por pantalla, porque antes el número aparecía suelto en una
 * veintena de sitios entre el Gateway y el front: cambiar "cuántas filas se ven" obligaba a
 * encontrarlos todos y acertar en los dos lados. Lo que hace defendible cada valor no es que esté
 * centralizado, es el porqué que lleva escrito debajo.
 */

/**
 * Panel de usuario, y default de los controladores del Gateway.
 *
 * 20 llena una pantalla normal sin dejar hueco muerto y sigue siendo una sola consulta barata. Es
 * también el default del servidor a propósito: una pantalla que no manda `pageSize` recibe lo mismo
 * que las demás, en vez de caer en un número distinto según el endpoint que le toque.
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Listados del panel de super admin.
 *
 * Más alto que el del cliente porque ahí no se navega un listado, se barre: el operador busca una
 * organización concreta entre cientos, y de 20 en 20 cuesta más clics que desplazarse. Las consultas
 * admin son `select` estrecho más `_count`, así que 50 filas no cambian su perfil.
 *
 * Está separado de `DEFAULT_PAGE_SIZE` aunque hoy nadie los mueva por su cuenta: comparten valor
 * ninguno, comparten motivo ninguno, y unirlos significaría que subir el admin suba en silencio
 * todas las pantallas de cliente.
 */
export const ADMIN_PAGE_SIZE = 50;

/**
 * Tablas densas: filas de catálogo y demás rejillas de captura.
 *
 * Son `<tr>` de una línea, sin avatar ni animación, así que 50 caben en pantalla y paginar menos
 * sería estorbar. Coincide en valor con `ADMIN_PAGE_SIZE` por casualidad, no por parentesco: si
 * mañana el admin baja a 30, estas tablas se quedan en 50.
 */
export const DENSE_PAGE_SIZE = 50;

/**
 * Techo de lo que se acepta por HTTP en `?limit=` o `?pageSize=`.
 *
 * No es una preferencia de interfaz: es lo que impide que un `?limit=100000` convierta un listado en
 * un volcado de tabla. Va en `@Max()`, nunca como valor por defecto.
 */
export const MAX_PAGE_SIZE = 100;

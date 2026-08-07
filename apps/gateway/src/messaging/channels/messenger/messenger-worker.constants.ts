/**
 * Ruta del worker que Cloud Tasks invoca para procesar una ventana de mensajes.
 *
 * Incluye el prefijo global `api` que fija `main.ts`, porque Cloud Tasks recibe la
 * URL absoluta y no pasa por el enrutado de Nest para construirla. Vive aparte para
 * que el controlador que encola y el que atiende no se importen entre sí.
 */
export const MESSENGER_WORKER_PATH = '/api/messenger/internal/process-window';

/** Identificador de proveedor para la tabla de deduplicación de webhooks. */
export const WEBHOOK_PROVIDER_MESSENGER = 'meta-messenger';

/** Prefijo de los nombres de tarea en Cloud Tasks (`wa` es el de WhatsApp). */
export const MESSENGER_TASK_PREFIX = 'ms';

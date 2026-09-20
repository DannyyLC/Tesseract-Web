/**
 * Slug fijo y reservado de la organización de plataforma, donde vive el super admin.
 *
 * Vivía como static privado en `SuperAdminBootstrapService`; se sube aquí porque
 * `AnnouncementsService` también necesita excluirla del fan-out global (el super admin
 * es operador, no destinatario de anuncios) y duplicar el literal 'platform' en dos
 * archivos es la forma en que ese invariante se desincroniza en silencio.
 */
export const PLATFORM_ORG_SLUG = 'platform';

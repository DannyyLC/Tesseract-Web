// ============================================
// ENUMS
// ============================================

/**
 * Roles disponibles en una organización
 *
 * - SUPER_ADMIN: Dueño del sistema, acceso a TODAS las organizaciones (definido en config, no en DB)
 * - OWNER: Dueño de la organización, acceso total a SU organización
 * - ADMIN: Administrador con permisos de gestión en SU organización
 * - VIEWER: Solo lectura, no puede modificar nada
 */
export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  OWNER = 'owner',
  ADMIN = 'admin',
  VIEWER = 'viewer',
}

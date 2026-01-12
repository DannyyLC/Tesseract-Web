/**
 * Sistema de Roles y Permisos
 *
 * Define los roles disponibles en la organización y sus permisos asociados.
 * Este archivo centraliza la configuración de autorización para mantener
 * consistencia entre frontend y backend.
 */

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

/**
 * Permisos granulares del sistema
 *
 * Estos permisos se usan para validar acciones específicas.
 * Los roles se mapean a conjuntos de permisos.
 */
export enum Permission {
  // ===== SYSTEM (Solo SUPER_ADMIN) =====
  SYSTEM_VIEW_ALL_ORGANIZATIONS = 'system:view_all_organizations',
  SYSTEM_MANAGE_ORGANIZATIONS = 'system:manage_organizations',
  SYSTEM_MANAGE_USERS = 'system:manage_users',
  SYSTEM_VIEW_ANALYTICS = 'system:view_analytics',
  SYSTEM_CHANGE_PLANS = 'system:change_plans',
  SYSTEM_IMPERSONATE = 'system:impersonate',
  SYSTEM_VIEW_AUDIT_LOGS = 'system:view_audit_logs',
  SYSTEM_MANAGE_SYSTEM = 'system:manage_system',

  // ===== ORGANIZATION =====
  ORGANIZATION_READ = 'organization:read',
  ORGANIZATION_UPDATE = 'organization:update',
  ORGANIZATION_DELETE = 'organization:delete',
  ORGANIZATION_CHANGE_PLAN = 'organization:change_plan',

  // ===== USERS =====
  USERS_READ = 'users:read',
  USERS_INVITE = 'users:invite',
  USERS_UPDATE_ROLE = 'users:update_role',
  USERS_DELETE = 'users:delete',

  // ===== API KEYS =====
  API_KEYS_READ = 'api_keys:read',
  API_KEYS_CREATE = 'api_keys:create',
  API_KEYS_UPDATE = 'api_keys:update',
  API_KEYS_DELETE = 'api_keys:delete',

  // ===== WORKFLOWS =====
  WORKFLOWS_READ = 'workflows:read',
  WORKFLOWS_CREATE = 'workflows:create',
  WORKFLOWS_UPDATE = 'workflows:update',
  WORKFLOWS_DELETE = 'workflows:delete',
  WORKFLOWS_EXECUTE = 'workflows:execute',

  // ===== EXECUTIONS =====
  EXECUTIONS_READ = 'executions:read',
  EXECUTIONS_CANCEL = 'executions:cancel',

  // ===== ANALYTICS =====
  ANALYTICS_READ = 'analytics:read',
  ANALYTICS_EXPORT = 'analytics:export',

  // ===== WHATSAPP =====
  WHATSAPP_READ = 'whatsapp:read',
  WHATSAPP_CREATE = 'whatsapp:create',
  WHATSAPP_UPDATE = 'whatsapp:update',
  WHATSAPP_DELETE = 'whatsapp:delete',
}

// ============================================
// CONFIGURACIÓN DE PERMISOS POR ROL
// ============================================

/**
 * Mapeo de roles a permisos
 *
 * Define qué permisos tiene cada rol.
 * Usado por los guards para validar autorización.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPER_ADMIN]: [
    // SUPER_ADMIN tiene TODOS los permisos del sistema incluyendo permisos especiales
    // ===== SYSTEM (exclusivo de SUPER_ADMIN) =====
    Permission.SYSTEM_VIEW_ALL_ORGANIZATIONS,
    Permission.SYSTEM_MANAGE_ORGANIZATIONS,
    Permission.SYSTEM_MANAGE_USERS,
    Permission.SYSTEM_VIEW_ANALYTICS,
    Permission.SYSTEM_CHANGE_PLANS,
    Permission.SYSTEM_IMPERSONATE,
    Permission.SYSTEM_VIEW_AUDIT_LOGS,
    Permission.SYSTEM_MANAGE_SYSTEM,

    // ===== TODOS los permisos de OWNER =====
    Permission.ORGANIZATION_READ,
    Permission.ORGANIZATION_UPDATE,
    Permission.ORGANIZATION_DELETE,
    Permission.ORGANIZATION_CHANGE_PLAN,

    Permission.USERS_READ,
    Permission.USERS_INVITE,
    Permission.USERS_UPDATE_ROLE,
    Permission.USERS_DELETE,

    Permission.API_KEYS_READ,
    Permission.API_KEYS_CREATE,
    Permission.API_KEYS_UPDATE,
    Permission.API_KEYS_DELETE,

    Permission.WORKFLOWS_READ,
    Permission.WORKFLOWS_CREATE,
    Permission.WORKFLOWS_UPDATE,
    Permission.WORKFLOWS_DELETE,
    Permission.WORKFLOWS_EXECUTE,

    Permission.EXECUTIONS_READ,
    Permission.EXECUTIONS_CANCEL,

    Permission.ANALYTICS_READ,
    Permission.ANALYTICS_EXPORT,

    Permission.WHATSAPP_READ,
    Permission.WHATSAPP_CREATE,
    Permission.WHATSAPP_UPDATE,
    Permission.WHATSAPP_DELETE,
  ],

  [UserRole.OWNER]: [
    // Owner tiene TODOS los permisos
    Permission.ORGANIZATION_READ,
    Permission.ORGANIZATION_UPDATE,
    Permission.ORGANIZATION_DELETE,
    Permission.ORGANIZATION_CHANGE_PLAN,

    Permission.USERS_READ,
    Permission.USERS_INVITE,
    Permission.USERS_UPDATE_ROLE,
    Permission.USERS_DELETE,

    Permission.API_KEYS_READ,
    Permission.API_KEYS_CREATE,
    Permission.API_KEYS_UPDATE,
    Permission.API_KEYS_DELETE,

    Permission.WORKFLOWS_READ,
    Permission.WORKFLOWS_CREATE,
    Permission.WORKFLOWS_UPDATE,
    Permission.WORKFLOWS_DELETE,
    Permission.WORKFLOWS_EXECUTE,

    Permission.EXECUTIONS_READ,
    Permission.EXECUTIONS_CANCEL,

    Permission.ANALYTICS_READ,
    Permission.ANALYTICS_EXPORT,

    Permission.WHATSAPP_READ,
    Permission.WHATSAPP_CREATE,
    Permission.WHATSAPP_UPDATE,
    Permission.WHATSAPP_DELETE,
  ],

  [UserRole.ADMIN]: [
    // Admin puede gestionar workflows y ver analytics
    Permission.ORGANIZATION_READ,

    Permission.USERS_READ, // Puede ver otros usuarios

    Permission.API_KEYS_READ,
    Permission.API_KEYS_CREATE,
    Permission.API_KEYS_UPDATE,
    Permission.API_KEYS_DELETE,

    Permission.WORKFLOWS_READ,
    Permission.WORKFLOWS_CREATE,
    Permission.WORKFLOWS_UPDATE,
    Permission.WORKFLOWS_DELETE,
    Permission.WORKFLOWS_EXECUTE,

    Permission.EXECUTIONS_READ,
    Permission.EXECUTIONS_CANCEL,

    Permission.ANALYTICS_READ,
    Permission.ANALYTICS_EXPORT,

    Permission.WHATSAPP_READ,
    Permission.WHATSAPP_CREATE,
    Permission.WHATSAPP_UPDATE,
    Permission.WHATSAPP_DELETE,
  ],

  [UserRole.VIEWER]: [
    // Viewer solo puede leer
    Permission.ORGANIZATION_READ,

    Permission.USERS_READ,

    Permission.API_KEYS_READ,

    Permission.WORKFLOWS_READ,

    Permission.EXECUTIONS_READ,

    Permission.ANALYTICS_READ,

    Permission.WHATSAPP_READ,
  ],
};

// ============================================
// HELPERS
// ============================================

/**
 * Verifica si un rol tiene un permiso específico
 *
 * @param role - Rol del usuario
 * @param permission - Permiso a verificar
 * @returns true si el rol tiene el permiso
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Verifica si un rol tiene TODOS los permisos especificados
 *
 * @param role - Rol del usuario
 * @param permissions - Array de permisos a verificar
 * @returns true si el rol tiene todos los permisos
 */
export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  return permissions.every((permission) => hasPermission(role, permission));
}

/**
 * Verifica si un rol tiene AL MENOS UNO de los permisos especificados
 *
 * @param role - Rol del usuario
 * @param permissions - Array de permisos a verificar
 * @returns true si el rol tiene al menos un permiso
 */
export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}

/**
 * Obtiene todos los permisos de un rol
 *
 * @param role - Rol del usuario
 * @returns Array de permisos del rol
 */
export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Verifica si un rol puede realizar una acción sobre un recurso
 *
 * Alias semántico para hasPermission
 *
 * @param role - Rol del usuario
 * @param permission - Permiso requerido
 * @returns true si está autorizado
 */
export function isAuthorized(role: UserRole, permission: Permission): boolean {
  return hasPermission(role, permission);
}

// ============================================
// METADATA DE ROLES
// ============================================

/**
 * Metadata descriptiva de cada rol
 * Útil para mostrar en UI
 */
export const ROLE_METADATA: Record<
  UserRole,
  {
    label: string;
    description: string;
    color: string;
    icon: string;
  }
> = {
  [UserRole.SUPER_ADMIN]: {
    label: 'Super Admin',
    description: '⚠️ ACCESO TOTAL AL SISTEMA - Puede gestionar TODAS las organizaciones y usuarios',
    color: '#DC2626', // Red
    icon: '🔥',
  },
  [UserRole.OWNER]: {
    label: 'Owner',
    description: 'Dueño de la organización con acceso total y permisos de facturación',
    color: '#8B5CF6', // Purple
    icon: '👑',
  },
  [UserRole.ADMIN]: {
    label: 'Admin',
    description: 'Administrador con permisos para gestionar workflows, API keys y analytics',
    color: '#3B82F6', // Blue
    icon: '⚙️',
  },
  [UserRole.VIEWER]: {
    label: 'Viewer',
    description: 'Solo lectura, puede ver workflows y reportes sin modificarlos',
    color: '#10B981', // Green
    icon: '👁️',
  },
};

/**
 * Obtiene la metadata de un rol
 *
 * @param role - Rol del usuario
 * @returns Metadata del rol
 */
export function getRoleMetadata(role: UserRole) {
  return ROLE_METADATA[role];
}

/**
 * Verifica si un rol puede invitar usuarios
 * Solo Owner puede invitar
 */
export function canInviteUsers(role: UserRole): boolean {
  return hasPermission(role, Permission.USERS_INVITE);
}

/**
 * Verifica si un rol puede cambiar el plan
 * Solo Owner puede cambiar plan
 */
export function canChangePlan(role: UserRole): boolean {
  return hasPermission(role, Permission.ORGANIZATION_CHANGE_PLAN);
}

/**
 * Verifica si un rol puede gestionar API keys
 * Owner y Admin pueden gestionar API keys
 */
export function canManageApiKeys(role: UserRole): boolean {
  return hasPermission(role, Permission.API_KEYS_CREATE);
}

/**
 * Verifica si un rol puede gestionar workflows
 * Owner y Admin pueden gestionar workflows
 */
export function canManageWorkflows(role: UserRole): boolean {
  return hasPermission(role, Permission.WORKFLOWS_CREATE);
}

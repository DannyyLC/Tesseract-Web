/**
 * Estructura del payload que se almacena en el JWT token (LEGACY)
 * Este es el contenido que se codifica en el token
 * @deprecated Use UserPayload instead
 */
export interface JwtPayload {
  sub: string;        // Subject - ID del cliente (clientId)
  email: string;      // Email del cliente
  name: string;       // Nombre del cliente
  plan: string;       // Plan del cliente (free, pro, enterprise)
  iat?: number;       // Issued At - Timestamp de creación
  exp?: number;       // Expiration - Timestamp de expiración
}

/**
 * Estructura del payload del JWT para usuarios en el sistema multi-tenant
 * Incluye información del usuario y su organización
 */
export interface UserPayload {
  sub: string;                 // User ID
  email: string;               // User email
  name: string;                // User name
  role: string;                // User role: owner, admin, viewer
  organizationId: string;      // Organization ID
  organizationName: string;    // Organization name (para logging)
  plan: string;                // Organization plan (free, pro, enterprise)
  iat?: number;                // Issued At
  exp?: number;                // Expiration
}

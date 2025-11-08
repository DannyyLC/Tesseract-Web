/**
 * Estructura del payload que se almacena en el JWT token
 * Este es el contenido que se codifica en el token
 */
export interface JwtPayload {
  sub: string;        // Subject - ID del cliente (clientId)
  email: string;      // Email del cliente
  name: string;       // Nombre del cliente
  plan: string;       // Plan del cliente (free, pro, enterprise)
  iat?: number;       // Issued At - Timestamp de creación
  exp?: number;       // Expiration - Timestamp de expiración
}

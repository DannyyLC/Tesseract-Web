import { SubscriptionPlan, UserRole } from '@prisma/client';

/**
 * Payload de un Usuario autenticado por JWT
 * Este payload se usa cuando un usuario inicia sesión desde el dashboard.
 */
export interface UserPayload {
  sub: string; // Subject - ID del usuario (userId)
  email: string; // Email del usuario
  name: string; // Nombre del usuario
  role: UserRole; // Rol del usuario en su organización
  organizationId: string; // ID de la organización
  organizationName?: string; // Nombre de la organización
  plan?: SubscriptionPlan; // Plan de suscripción de la organización
  rememberMe?: boolean; // Remember Me flag
  iat?: number; // Issued At - Timestamp de creación
  exp?: number; // Expiration - Timestamp de expiración
}

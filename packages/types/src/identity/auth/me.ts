// -----------------------------------------------------------
// Me — usuario autenticado actual
// -----------------------------------------------------------

/**
 * Respuesta de GET /auth/me
 * Contiene el payload del JWT más el estado de seguridad de la cuenta.
 */
export interface MeResponse {
  sub: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  rememberMe?: boolean;
  hasPassword: boolean;
  twoFactorEnabled: boolean;
}

// -----------------------------------------------------------
// Login
// -----------------------------------------------------------

/** Payload que el front envía para iniciar sesión */
export interface LoginDto {
  email: string;
  password: string;
  rememberMe?: boolean;
  turnstileToken?: string;
}

/** Info del usuario devuelta tras un login exitoso */
export interface AuthUserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  organizationId: string;
}

/** Respuesta cuando el login es directo (sin 2FA) */
export interface LoginCompleteResponse {
  user: AuthUserDto;
  rememberMe: boolean;
}

/** Respuesta cuando el login requiere verificar 2FA */
export interface Login2FARequiredResponse {
  require2FA: true;
}

/** Unión de posibles respuestas del endpoint POST /auth/login */
export type LoginResponse = LoginCompleteResponse | Login2FARequiredResponse;
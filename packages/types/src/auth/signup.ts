// -----------------------------------------------------------
// Signup flow
// -----------------------------------------------------------
/** Paso 1: Iniciar el flujo de verificación — envía código al correo */
export interface StartVerificationFlowDto {
  userName: string;
  email: string;
  organizationName: string;
  turnstileToken?: string;
}

/** Paso 2: Verificar el código recibido por correo */
export interface VerificationCodeDto {
  email: string;
  verificationCode: string;
}

/** Paso 3: Completar el registro con contraseña */
export interface RegisterDto {
  name: string;
  email: string;
  password: string;
}

/** Frontend compat: Payload simplificado para usar durante la creación sin nombre */
export interface CreateUserDto {
  email: string;
  password: string;
}

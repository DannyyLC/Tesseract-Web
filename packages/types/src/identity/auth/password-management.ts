// -----------------------------------------------------------
// Password management
// -----------------------------------------------------------
/** Solicitar código de recuperación por correo */
export interface ForgotPassDto {
  email: string;
  turnstileToken?: string;
}

/** Usar el código recibido para establecer nueva contraseña */
export interface ResetPasswordDto {
  verificationCode: string;
  newPassword: string;
}

/** Cambiar contraseña estando autenticado */
export interface ChangePasswordDto {
  currentPassword?: string;
  newPassword: string;
  code2FA?: string;
}

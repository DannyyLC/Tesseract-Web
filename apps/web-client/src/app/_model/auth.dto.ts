export interface StartVerificationFlowDto {
  email: string;
  organizationName: string;
  userName: string;
  turnstileToken?: string;
}

export interface VerificationCodeDto {
  verificationCode: string;
  email: string;
}

export interface CreateUserDto {
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
  rememberMe?: boolean;
  turnstileToken?: string;
}

export interface Verify2FACodeDto {
  code2FA: string;
}

export interface ForgotPassDto {
  email: string;
  turnstileToken?: string;
}

export interface ResetPasswordDto {
  verificationCode: string;
  newPassword: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  code2FA?: string;
}
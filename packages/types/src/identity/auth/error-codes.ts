// ============================================================
// Auth Error Codes — Shared enums for error handling in frontend
// ============================================================

export enum SignupStepOneErrors {
  ALREADY_IN_PROGRESS = 'ALREADY_IN_PROGRESS',
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',
  TRANSPORTER_ERROR = 'TRANSPORTER_ERROR',
  SERVER_INTERNAL_ERROR = 'SERVER_INTERNAL_ERROR',
}

export enum SignupStepThreeErrors {
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  SERVER_INTERNAL_ERROR = 'SERVER_INTERNAL_ERROR',
}

export enum ForgotPasswordErrors {
  EMAIL_NOT_REGISTERED = 'EMAIL_NOT_REGISTERED',
  SEND_EMAIL_ERROR = 'SEND_EMAIL_ERROR',
  VERIFICATION_CODE_INVALID = 'VERIFICATION_CODE_INVALID',
  ALREADY_IN_PROGRESS = 'ALREADY_IN_PROGRESS',
  SERVER_INTERNAL_ERROR = 'SERVER_INTERNAL_ERROR',
}

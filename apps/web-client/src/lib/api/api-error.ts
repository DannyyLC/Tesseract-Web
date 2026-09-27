import type { AxiosResponse } from 'axios';

/** Fallo de validación de un campo del DTO. */
export interface FieldError {
  field: string;
  constraints: string[];
}

/**
 * Cuerpo de error que manda el gateway. `errors` trae fallos de validación, salvo en
 * endpoints como el paso 1 del signup, que mandan códigos sueltos (`EMAIL_ALREADY_EXISTS`).
 */
export interface ApiErrorBody {
  message?: unknown;
  error?: unknown;
  errorCode?: string;
  errors?: Array<FieldError | string>;
  details?: { errors?: unknown };
}

/** Error que rechaza el interceptor de `api-request-manager.ts`. */
export interface ApiError extends Error {
  response?: AxiosResponse<ApiErrorBody>;
  errorCode?: string;
  errors?: ApiErrorBody['errors'];
  /** El interceptor ya mostró un toast genérico (403, 429, 5xx). */
  toastHandled?: boolean;
}

/** Normaliza lo que llega a un `catch`: lo que no sea `Error` se envuelve en uno. */
export function toApiError(error: unknown): ApiError {
  return error instanceof Error ? error : new Error(String(error));
}

export function isFieldError(value: unknown): value is FieldError {
  return typeof value === 'object' && value !== null && 'constraints' in value;
}

export function isToastHandled(error: unknown): boolean {
  return toApiError(error).toastHandled === true;
}

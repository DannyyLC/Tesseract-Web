import { isAxiosError } from 'axios';

/** Mensaje legible de algo lanzado en un `catch`, que TypeScript tipa como `unknown`. */
export function errorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

/**
 * Detalle de un error HTTP de axios: lo que respondió el proveedor, que es donde viene el
 * motivo real del rechazo (el `message` de axios solo dice el status).
 */
export function httpErrorDetail(error: unknown): string {
  if (isAxiosError(error) && error.response?.data !== undefined) {
    return JSON.stringify(error.response.data);
  }
  return errorMessage(error);
}

/** `error_description` de una respuesta OAuth de Google, o el mensaje del error. */
export function oauthErrorDescription(error: unknown): string {
  if (isAxiosError<{ error_description?: string }>(error)) {
    const description = error.response?.data?.error_description;
    if (description) return description;
  }
  return errorMessage(error);
}

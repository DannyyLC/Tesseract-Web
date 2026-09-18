import { useTranslations } from 'next-intl';

/**
 * Forma del error que arma el interceptor de axios (`api-request-manager.ts`) a partir de
 * la respuesta del `GlobalExceptionFilter` del gateway.
 */
interface ApiErrorLike {
  errorCode?: string;
  errors?: Array<{ field: string; constraints: string[] }>;
  message?: string;
}

/**
 * Resuelve el texto visible de un error de la API por `errorCode` (namespace `Errors` de
 * `messages/*.json`), nunca por `e.message` — ese texto viene del `throw` original en el
 * back y no tiene garantía de idioma. Úsalo en cualquier `toast.error(...)` que hoy
 * muestre `e.message`.
 *
 * Si el error trae `errors` (fallos de validación de un DTO), devuelve el mensaje del
 * primer campo con problemas, vía el namespace `Validation`.
 */
export function useApiErrorMessage() {
  const tErrors = useTranslations('Errors');
  const tValidation = useTranslations('Validation');

  return (error: ApiErrorLike | null | undefined): string => {
    const firstFieldError = error?.errors?.[0];
    if (firstFieldError) {
      const constraint = firstFieldError.constraints[0] ?? 'generic';
      try {
        return tValidation(constraint);
      } catch {
        return tValidation('generic');
      }
    }

    const errorCode = error?.errorCode;
    if (errorCode) {
      try {
        return tErrors(errorCode);
      } catch {
        // errorCode no mapeado en messages/*.json (ej. uno nuevo agregado en el back sin
        // actualizar el front todavía) — cae al genérico en vez de mostrar la clave cruda.
      }
    }
    return tErrors('UNKNOWN');
  };
}

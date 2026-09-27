import type { ApiResponse } from '@tesseract/types';

/**
 * Extrae `data` de la envoltura `ApiResponse` del gateway. Un `null` en un endpoint que
 * siempre devuelve contenido es un contrato roto: mejor un error con la ruta que un
 * `undefined` viajando hasta la UI.
 */
export function unwrapData<T>(response: { data: ApiResponse<T>; config?: { url?: string } }): T {
  const { data } = response.data;
  if (data === null || data === undefined) {
    throw new Error(`Respuesta sin datos de ${response.config?.url ?? 'la API'}`);
  }
  return data;
}

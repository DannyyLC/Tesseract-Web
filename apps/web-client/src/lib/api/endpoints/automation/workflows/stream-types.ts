/** Datos de un evento SSE con nombre (`event: conversation_id`): JSON si parsea, texto si no. */
export type StreamEventHandler = (event: string, data: unknown) => void;

export type StreamCallbacks = {
  onOpen?: () => void;
  onChunk: (chunk: string) => void;
  onEvent?: StreamEventHandler;
  onError?: (error: unknown) => void;
  onComplete?: () => void;
};

/** Error de un stream que el gateway rechazó antes de abrirlo. */
export interface StreamError extends Error {
  statusCode?: number;
  errorCode?: string;
}

export function toStreamError(error: unknown): StreamError {
  return error instanceof Error ? error : new Error(String(error));
}

/** Arma el error a partir de la respuesta no-OK del gateway (`GlobalExceptionFilter`). */
export async function streamErrorFrom(response: Response, fallback: string): Promise<StreamError> {
  let body: { message?: unknown; errorCode?: unknown } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // Sin cuerpo JSON: queda el mensaje genérico.
  }
  const err: StreamError = new Error(
    typeof body.message === 'string' && body.message ? body.message : fallback,
  );
  err.statusCode = response.status;
  if (typeof body.errorCode === 'string') err.errorCode = body.errorCode;
  return err;
}

/** Payload de un evento SSE cuyo contrato es un string (`conversation_id`, `execution_id`). */
export function eventString(data: unknown): string | undefined {
  return typeof data === 'string' ? data : undefined;
}

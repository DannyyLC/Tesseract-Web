import { Prisma } from '@tesseract/database';

/**
 * Forma de `Execution.result`: la respuesta del agente tal como se guardó (JSON en la base).
 * Solo se declaran los campos que se leen; el resto viaja sin tocar.
 */
export interface StoredExecutionResult {
  conversationId?: string;
  messages?: { role?: string; content?: string | null }[];
  metadata?: { execution_time_ms?: number; [key: string]: unknown };
  [key: string]: unknown;
}

export function readExecutionResult(result: Prisma.JsonValue | null): StoredExecutionResult {
  return (result ?? {}) as StoredExecutionResult;
}

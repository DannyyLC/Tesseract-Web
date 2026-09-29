import { streamErrorFrom, type StreamCallbacks } from './stream-types';

class WorkflowsStream {
  private static BASE_URL = '/workflows';
  private static API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api';

  /**
   * Refresca el accessToken via cookie httpOnly.
   * Retorna true si el refresh fue exitoso.
   */
  private static async _refreshToken(): Promise<boolean> {
    try {
      const response = await fetch(`${WorkflowsStream.API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Ejecuta un workflow y recibe la respuesta como stream (POST con fetch).
   * Si el accessToken expiró (401), intenta refrescarlo y reintenta una vez.
   * Ideal para chat en vivo o logs en tiempo real.
   */
  public static async executeStream(
    id: string,
    input: Record<string, unknown>,
    metadata?: Record<string, unknown>,
    callbacks?: StreamCallbacks,
  ): Promise<void> {
    return WorkflowsStream._doExecuteStream(id, input, metadata, callbacks, false);
  }

  private static async _doExecuteStream(
    id: string,
    input: Record<string, unknown>,
    metadata?: Record<string, unknown>,
    callbacks?: StreamCallbacks,
    retried?: boolean,
  ): Promise<void> {
    const url = `${WorkflowsStream.API_URL}${WorkflowsStream.BASE_URL}/${id}/execute/stream`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input, metadata }),
        // Importante: incluir cookies para la autenticación
        credentials: 'include',
      });

      if (!response.ok) {
        // Token expirado: intentar refresh y reintentar una sola vez
        if (response.status === 401 && !retried) {
          const refreshed = await WorkflowsStream._refreshToken();
          if (refreshed) {
            return WorkflowsStream._doExecuteStream(id, input, metadata, callbacks, true);
          }
          // Refresh fallido: sesión expirada, redirigir al login
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
          return;
        }

        throw await streamErrorFrom(response, `Error executing stream: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported in this browser.');
      }

      callbacks?.onOpen?.();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // Por stream, no en la clase: dos ejecuciones simultáneas no deben pisarse el evento.
      let currentEvent: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split('\n');
        // Keep the last line in buffer if it's incomplete (doesn't end with newline)
        // However, split won't give us emptiness at end if ends with newline unless valid split?
        // Standard approach: pop the last element which might be partial
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          // SSE: una línea `event:` nombra al `data:` que la sigue; sin ella, el `data:` es texto.
          if (trimmed.startsWith('event: ')) {
            currentEvent = trimmed.slice(7).trim();
            continue;
          }

          if (trimmed.startsWith('data: ')) {
            const dataContent = trimmed.slice(6);
            let parsed: unknown = dataContent;
            try {
              parsed = JSON.parse(dataContent);
            } catch {
              // Valid string, not JSON
            }

            if (currentEvent) {
              callbacks?.onEvent?.(currentEvent, parsed);
              currentEvent = null;
            } else {
              callbacks?.onChunk(typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
            }
          }
        }
      }

      callbacks?.onComplete?.();
    } catch (error) {
      console.error('Stream execution failed:', error);
      callbacks?.onError?.(error);
      throw error;
    }
  }
}

export default WorkflowsStream;

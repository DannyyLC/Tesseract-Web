type StreamCallbacks = {
  onOpen?: () => void;
  onChunk: (chunk: string) => void;
  onEvent?: (event: string, data: any) => void;
  onError?: (error: any) => void;
  onComplete?: () => void;
};

/**
 * Gemelo de `WorkflowsStream` (workflows-stream.ts) para `POST
 * /admin/workflows/:id/test-execute/stream` — mismo formato SSE, mismo endpoint del
 * lado del gateway (`WorkflowsExecutionAdminController.testExecuteStream` reusa
 * literalmente `WorkflowsService.executeStream()`), pero el body y la URL son de admin
 * (`organizationId` explícito, sin sesión de tenant). `trigger` del DTO no se expone
 * acá — el panel de prueba siempre simula MANUAL, que es lo que el backend usa por
 * default si se omite.
 *
 * Se duplica el parseo en vez de generalizar `WorkflowsStream`: es la única ruta de
 * streaming que ve tráfico real de clientes, y no vale la pena arriesgar una regresión
 * ahí por una herramienta de admin que se usa poco. Si algún día hace falta compartir
 * lógica, extraer el loop de lectura del stream (a partir de `getReader()`) a un
 * helper puro que reciba `Response` es más seguro que tocar la clase existente.
 */
class WorkflowsAdminTestStream {
  private static BASE_URL = '/admin/workflows';
  private static API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api';

  private static async _refreshToken(): Promise<boolean> {
    try {
      const response = await fetch(`${WorkflowsAdminTestStream.API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  public static async testExecuteStream(
    id: string,
    organizationId: string,
    input: Record<string, any>,
    metadata?: Record<string, any>,
    callbacks?: StreamCallbacks,
  ): Promise<void> {
    return WorkflowsAdminTestStream._doExecute(
      id,
      organizationId,
      input,
      metadata,
      callbacks,
      false,
    );
  }

  private static async _doExecute(
    id: string,
    organizationId: string,
    input: Record<string, any>,
    metadata: Record<string, any> | undefined,
    callbacks: StreamCallbacks | undefined,
    retried: boolean,
  ): Promise<void> {
    const url = `${WorkflowsAdminTestStream.API_URL}${WorkflowsAdminTestStream.BASE_URL}/${id}/test-execute/stream`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, input, metadata }),
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401 && !retried) {
          const refreshed = await WorkflowsAdminTestStream._refreshToken();
          if (refreshed) {
            return WorkflowsAdminTestStream._doExecute(
              id,
              organizationId,
              input,
              metadata,
              callbacks,
              true,
            );
          }
          if (typeof window !== 'undefined') window.location.href = '/login';
          return;
        }

        let errorBody: any = {};
        try {
          errorBody = await response.json();
        } catch {
          // sin body o no era JSON: se usa el mensaje genérico de abajo
        }
        const err: any = new Error(
          errorBody.message || `Error executing test stream: ${response.statusText}`,
        );
        err.statusCode = response.status;
        throw err;
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported in this browser.');
      }

      callbacks?.onOpen?.();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('event: ')) {
            currentEvent = trimmed.slice(7).trim();
            continue;
          }

          if (trimmed.startsWith('data: ')) {
            const dataContent = trimmed.slice(6);
            let parsed: any = dataContent;
            try {
              parsed = JSON.parse(dataContent);
            } catch {
              // no era JSON, se manda tal cual
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
      console.error('Admin test-execute stream failed:', error);
      callbacks?.onError?.(error);
      throw error;
    }
  }
}

export default WorkflowsAdminTestStream;

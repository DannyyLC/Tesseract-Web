class SseRequestManager {
  // Usamos la misma variable de entorno que ApiRequestManager para mantener consistencia
  private static BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api';

  /**
   * Crea una nueva conexión de EventSource (SSE) configurada.
   *
   * @param endpoint El path relativo del recurso (ej: "/executions/123/logs")
   * @returns Una instancia nativa de EventSource lista para usar
   */
  public static create(endpoint: string): EventSource {
    // Aseguramos que la URL esté bien formada
    // Si el endpoint no empieza con /, lo agregamos
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const fullUrl = `${this.BASE_URL}${normalizedEndpoint}`;

    console.log(`[SSE] Conectando a: ${fullUrl}`);

    // Creamos la conexión
    // withCredentials: true es CRITICO para que envíe las cookies de sesión (httpOnly)
    // tal como lo hace tu ApiRequestManager con axios.
    return new EventSource(fullUrl, {
      withCredentials: true,
    });
  }
}

export default SseRequestManager;

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import {
  N8nWebhookErrorException,
  N8nWebhookTimeoutException,
} from '../../common/exceptions';

/**
 * Configuración para llamar al webhook de n8n
 * Se extrae del workflow.config cuando type="n8n"
 */
export interface N8nWebhookConfig {
  webhookUrl: string;
  method?: string; // POST, GET, PUT, etc.
  headers?: Record<string, string>;
  timeout?: number; // En milisegundos
  retryOnFail?: boolean;
  retryDelay?: number; // En milisegundos
  maxRetries?: number;
}

/**
 * Service para ejecutar workflows de n8n
 * 
 * Responsabilidades:
 * - Hacer peticiones HTTP a webhooks de n8n
 * - Manejar timeouts y reintentos
 * - Loguear requests y responses
 * - Convertir errores HTTP en excepciones custom
 * 
 * Usa HttpService de @nestjs/axios (wrapper sobre axios)
 */
@Injectable()
export class N8nService {
  private readonly logger = new Logger(N8nService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Ejecutar un webhook de n8n
   * 
   * @param config - Configuración del webhook (URL, headers, timeout, etc.)
   * @param payload - Datos a enviar al webhook
   * @param executionId - ID de la ejecución (para logging y tracking)
   * @returns La respuesta del webhook de n8n
   * 
   * @throws N8nWebhookTimeoutException si el webhook no responde a tiempo
   * @throws N8nWebhookErrorException si el webhook devuelve error
   */
  async executeWebhook(
    config: N8nWebhookConfig,
    payload: any,
    executionId: string,
  ): Promise<any> {
    const startTime = Date.now();

    // Configuración por defecto
    const webhookUrl = config.webhookUrl;
    const method = (config.method || 'POST').toUpperCase();
    const timeout = config.timeout || 30000; // 30 segundos por defecto
    const maxRetries = config.maxRetries || 0; // Sin reintentos por defecto
    const retryDelay = config.retryDelay || 5000; // 5 segundos entre reintentos

    this.logger.log(
      `Ejecutando webhook de n8n: ${webhookUrl} (execution: ${executionId})`,
    );

    // Intentar ejecutar con reintentos
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= maxRetries) {
      try {
        // Si no es el primer intento, esperar antes de reintentar
        if (attempt > 0) {
          this.logger.warn(
            `Reintento ${attempt}/${maxRetries} para execution ${executionId} después de ${retryDelay}ms`,
          );
          await this.sleep(retryDelay);
        }

        attempt++;

        // Hacer la petición HTTP
        const response = await this.makeRequest(
          webhookUrl,
          method,
          payload,
          config.headers,
          timeout,
          executionId,
        );

        // Calcular duración
        const duration = Date.now() - startTime;

        this.logger.log(
          `Webhook ejecutado exitosamente en ${duration}ms (execution: ${executionId})`,
        );

        return response;
      } catch (error) {
        lastError = error as Error;

        // Si es un timeout, no reintentar (es muy probable que siga fallando)
        if (error instanceof N8nWebhookTimeoutException) {
          throw error;
        }

        // Si no hay más reintentos, lanzar el error
        if (attempt > maxRetries) {
          break;
        }

        // Si retryOnFail es false, no reintentar
        if (config.retryOnFail === false) {
          break;
        }

        this.logger.warn(
          `Error en intento ${attempt}/${maxRetries + 1}: ${(error as Error).message}`,
        );
      }
    }

    // Si llegamos aquí, todos los intentos fallaron
    const duration = Date.now() - startTime;
    this.logger.error(
      `Webhook falló después de ${attempt} intentos en ${duration}ms (execution: ${executionId})`,
    );

    throw lastError!;
  }

  /**
   * Hacer la petición HTTP real
   * 
   * @private
   */
  private async makeRequest(
    url: string,
    method: string,
    payload: any,
    headers?: Record<string, string>,
    timeout?: number,
    executionId?: string,
  ): Promise<any> {
    try {
      // Headers por defecto + headers custom
      const requestHeaders = {
        'Content-Type': 'application/json',
        'User-Agent': 'WorkflowGateway/1.0',
        ...(executionId && { 'X-Execution-Id': executionId }),
        ...headers,
      };

      // Configuración de la petición
      const requestConfig = {
        headers: requestHeaders,
        timeout: timeout || 30000,
      };

      // Hacer la petición según el método
      let response;
      if (method === 'GET') {
        response = await firstValueFrom(
          this.httpService.get(url, requestConfig),
        );
      } else if (method === 'POST') {
        response = await firstValueFrom(
          this.httpService.post(url, payload, requestConfig),
        );
      } else if (method === 'PUT') {
        response = await firstValueFrom(
          this.httpService.put(url, payload, requestConfig),
        );
      } else if (method === 'PATCH') {
        response = await firstValueFrom(
          this.httpService.patch(url, payload, requestConfig),
        );
      } else {
        throw new Error(`Método HTTP no soportado: ${method}`);
      }

      return response.data;
    } catch (error) {
      // Manejar errores de axios
      if (error instanceof AxiosError) {
        // Timeout
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          throw new N8nWebhookTimeoutException(
            url,
            Math.floor((timeout || 30000) / 1000),
          );
        }

        // Error de red (servidor no disponible, DNS no resuelve, etc.)
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          throw new N8nWebhookErrorException(
            url,
            `No se pudo conectar al servidor: ${error.message}`,
            error.response?.status,
          );
        }

        // Error HTTP (4xx, 5xx)
        if (error.response) {
          const statusCode = error.response.status;
          const statusText = error.response.statusText;
          const errorData = error.response.data;

          throw new N8nWebhookErrorException(
            url,
            `HTTP ${statusCode} ${statusText}: ${JSON.stringify(errorData)}`,
            statusCode,
          );
        }

        // Otro error de axios
        throw new N8nWebhookErrorException(url, error.message);
      }

      // Error desconocido
      throw new N8nWebhookErrorException(
        url,
        (error as Error).message || 'Unknown error',
      );
    }
  }

  /**
   * Helper para esperar (usado en reintentos)
   * 
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Validar que una URL de webhook es válida
   * Se puede usar antes de guardar un workflow en la BD
   * 
   * @param webhookUrl - URL a validar
   * @returns true si es válida, false si no
   */
  validateWebhookUrl(webhookUrl: string): boolean {
    try {
      const url = new URL(webhookUrl);
      
      // Debe ser HTTP o HTTPS
      if (!['http:', 'https:'].includes(url.protocol)) {
        return false;
      }

      // Debe tener un host válido
      if (!url.hostname) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }
}

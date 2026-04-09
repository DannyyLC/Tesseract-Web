import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { AxiosError } from 'axios';
import { AgentExecutionRequestDto, AgentExecutionResponseDto } from './dto';

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);
  private readonly agentsServiceUrl: string;
  private readonly agentsServiceTimeout: number;
  private readonly internalSecret: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.agentsServiceUrl = this.configService.get<string>(
      'AGENTS_API_URL',
      'http://localhost:8000',
    );
    this.agentsServiceTimeout = this.configService.get<number>(
      'AGENTS_SERVICE_TIMEOUT',
      30000, // 30 segundos por defecto
    );
    this.internalSecret = this.configService.get<string>('AGENTS_INTERNAL_SECRET', '');

    this.logger.log(`Agents service URL: ${this.agentsServiceUrl}`);
  }

  private get internalHeaders(): Record<string, string> {
    return this.internalSecret ? { 'X-Internal-Token': this.internalSecret } : {};
  }

  /**
   * Reintenta una operación cuando el servicio de agents no está disponible (cold start de Cloud Run).
   * Solo reintenta en errores de conexión (503/408), no en errores de lógica del agente.
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries = 3,
    retryDelayMs = 4000,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (!(error instanceof HttpException)) throw error;
        const status = error.getStatus();
        const isRetryable =
          status === HttpStatus.SERVICE_UNAVAILABLE || status === HttpStatus.REQUEST_TIMEOUT;
        if (!isRetryable) throw error;
        if (attempt < maxRetries) {
          this.logger.warn(
            `[${context}] Agents service not ready (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${retryDelayMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }
    throw lastError;
  }

  /**
   * Ejecuta un agente en el servicio de Python
   *
   * @param request - Request completo con toda la configuración
   * @returns Response del agente con los mensajes generados
   */
  async execute(request: AgentExecutionRequestDto): Promise<AgentExecutionResponseDto> {
    const url = `${this.agentsServiceUrl}/api/v1/agents/execute`;

    this.logger.debug(
      `Executing agent for tenant: ${request.tenant_id}, workflow: ${request.workflow_id}`,
    );

    return this.withRetry(async () => {
      try {
        const response = await firstValueFrom(
          this.httpService.post<AgentExecutionResponseDto>(url, request, { headers: this.internalHeaders }).pipe(
            timeout({ each: this.agentsServiceTimeout }),
            catchError((error: AxiosError) => {
              this.logger.error(`Failed to execute agent: ${error.message}`, error.stack);

              if (error.code === 'ECONNREFUSED') {
                throw new HttpException(
                  'Agents service is not available',
                  HttpStatus.SERVICE_UNAVAILABLE,
                );
              }

              if (error.code === 'ETIMEDOUT' || error.name === 'TimeoutError') {
                throw new HttpException('Agent execution timed out', HttpStatus.REQUEST_TIMEOUT);
              }

              if (error.response) {
                throw new HttpException(
                  error.response.data ?? 'Agent execution failed',
                  error.response.status,
                );
              }

              throw new HttpException(
                'Failed to communicate with agents service',
                HttpStatus.INTERNAL_SERVER_ERROR,
              );
            }),
          ),
        );

        this.logger.debug(
          `Agent execution completed for conversation: ${response.data.conversation_id}`,
        );

        return response.data;
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }

        this.logger.error(
          `Unexpected error executing agent: ${(error as Error).message}`,
          (error as Error).stack,
        );

        throw new HttpException(
          'Unexpected error during agent execution',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }, 'execute');
  }
  /**
   * Ejecuta un agente en modo streaming
   *
   * @param request - Request completo
   * @returns Stream de SSE (Server-Sent Events)
   */
  async executeStream(request: AgentExecutionRequestDto): Promise<NodeJS.ReadableStream> {
    const url = `${this.agentsServiceUrl}/api/v1/agents/execute/stream`;

    this.logger.debug(
      `Executing streaming agent for tenant: ${request.tenant_id}, workflow: ${request.workflow_id}`,
    );

    return this.withRetry(async () => {
      try {
        // Usar responseType: 'stream' para obtener el stream raw
        const response = await firstValueFrom(
          this.httpService
            .post(url, request, {
              responseType: 'stream',
              headers: this.internalHeaders,
            })
            .pipe(
              // Timeout para establecer la conexión inicial (misma config que el modo no-stream)
              timeout({ each: this.agentsServiceTimeout }),
              catchError((error: AxiosError | Error) => {
                this.logger.error(
                  `Failed to initiate streaming agent: ${error.message}`,
                  error.stack,
                );

                // TimeoutError de RxJS — lanzar 408 para que withRetry lo reintente
                if (error.name === 'TimeoutError') {
                  throw new HttpException(
                    'Agent streaming connection timed out',
                    HttpStatus.REQUEST_TIMEOUT,
                  );
                }

                const axiosError = error as AxiosError;

                if (axiosError.code === 'ECONNREFUSED') {
                  throw new HttpException(
                    'Agents service is not available',
                    HttpStatus.SERVICE_UNAVAILABLE,
                  );
                }

                if (axiosError.response) {
                  throw new HttpException('Agent execution failed to start', axiosError.response.status);
                }

                throw new HttpException(
                  'Failed to communicate with agents service',
                  HttpStatus.INTERNAL_SERVER_ERROR,
                );
              }),
            ),
        );

        this.logger.debug(`Agent streaming initiatied for conversation: ${request.conversation_id}`);

        return response.data; // Retorna el stream (Readable)
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }

        this.logger.error(
          `Unexpected error initiating stream: ${(error as Error).message}`,
          (error as Error).stack,
        );

        throw new HttpException(
          'Unexpected error during agent execution',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }, 'executeStream');
  }

  /**
   * Health check del servicio de agents
   *
   * @returns true si el servicio está disponible
   */
  async healthCheck(): Promise<boolean> {
    const url = `${this.agentsServiceUrl}/health`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, { headers: this.internalHeaders }).pipe(
          timeout(5000),
          catchError(() => {
            throw new Error('Health check failed');
          }),
        ),
      );

      return response.status === 200;
    } catch (error) {
      this.logger.warn(`Agents service health check failed: ${(error as Error).message}`);
      return false;
    }
  }
}

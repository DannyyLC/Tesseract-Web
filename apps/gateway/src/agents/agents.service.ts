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

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.agentsServiceUrl = this.configService.get<string>(
      'AGENTS_SERVICE_URL',
      'http://localhost:8000',
    );
    this.agentsServiceTimeout = this.configService.get<number>(
      'AGENTS_SERVICE_TIMEOUT',
      30000, // 30 segundos por defecto
    );

    this.logger.log(`Agents service URL: ${this.agentsServiceUrl}`);
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

    try {
      const response = await firstValueFrom(
        this.httpService.post<AgentExecutionResponseDto>(url, request).pipe(
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
              // El servicio de Python respondió con un error
              throw new HttpException(
                error.response.data ?? 'Agent execution failed',
                error.response.status,
              );
            }

            // Error desconocido
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
      // Re-throw si ya es un HttpException
      if (error instanceof HttpException) {
        throw error;
      }

      // Error inesperado
      this.logger.error(
        `Unexpected error executing agent: ${(error as Error).message}`,
        (error as Error).stack,
      );

      throw new HttpException(
        'Unexpected error during agent execution',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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

    try {
      // Usar responseType: 'stream' para obtener el stream raw
      const response = await firstValueFrom(
        this.httpService
          .post(url, request, {
            responseType: 'stream',
          })
          .pipe(
            // El timeout inicial es solo para establecer la conexión
            // No aplica al stream completo (que puede durar mucho más)
            timeout({ each: 10000 }),
            catchError((error: AxiosError) => {
              this.logger.error(
                `Failed to initiate streaming agent: ${error.message}`,
                error.stack,
              );

              if (error.code === 'ECONNREFUSED') {
                throw new HttpException(
                  'Agents service is not available',
                  HttpStatus.SERVICE_UNAVAILABLE,
                );
              }

              if (error.response) {
                // Si hay response en error, es que el server rechazó el request (ej: 422)
                // Si es stream, la data puede ser un stream también, hay que tener cuidado
                // Pero usualmente errores 4xx/5xx devolvemos JSON antes de empezar el stream
                throw new HttpException('Agent execution failed to start', error.response.status);
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
        this.httpService.get(url).pipe(
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

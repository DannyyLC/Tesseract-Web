import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
  ServiceUnavailableException,
  RequestTimeoutException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { GoogleAuth, IdTokenClient } from 'google-auth-library';
import { join } from 'path';
import { AgentExecutionRequestDto, AgentExecutionResponseDto } from './dto';

@Injectable()
export class AgentsService implements OnModuleInit {
  private readonly logger = new Logger(AgentsService.name);
  private readonly agentsGrpcUrl: string;
  private readonly agentsGrpcUseTls: boolean;
  private readonly agentsServiceTimeout: number;
  private readonly internalSecret: string;
  private grpcClient: any;

  /**
   * Identidad del Gateway frente a Cloud Run. Google emite un ID token firmado que dice a
   * nombre de quién va (la service account del servicio) y para qué URL sirve; Cloud Run lo
   * valida en el borde, antes de que la petición llegue al proceso de Python. Sustituye al
   * secreto compartido, que es un string sin caducidad ni identidad detrás.
   */
  private readonly auth = new GoogleAuth();
  private readonly agentsAudience: string;
  private idTokenClient?: Promise<IdTokenClient>;

  constructor(private readonly configService: ConfigService) {
    const configuredUrl = this.configService.get<string>('AGENTS_GRPC_URL', 'localhost:50051');
    this.agentsGrpcUseTls = configuredUrl.startsWith('https://');
    // La audiencia tiene que ser exactamente la URL del servicio: `origin` y no la cadena
    // cruda, porque un `:443` o un slash final la invalidan y ese fallo no se nota hasta que
    // se cierra el servicio con IAM (hasta entonces la cabecera de más se ignora).
    this.agentsAudience = this.agentsGrpcUseTls ? new URL(configuredUrl).origin : '';
    this.agentsGrpcUrl = configuredUrl.replace(/^https?:\/\//, '');
    this.agentsServiceTimeout = Number(this.configService.get<string>('AGENTS_SERVICE_TIMEOUT', '30000'));
    this.internalSecret = this.configService.get<string>('AGENTS_INTERNAL_SECRET', '');
    // Sin bandera aparte para local: si la URL no trae TLS es localhost, y ahí no hay metadata
    // server al que pedirle el token. El log deja el modo por escrito para que no sea magia
    // silenciosa, y la audiencia impresa es con la que se compara la URL real del servicio
    // antes de cerrarlo (ver docs/setup/deployment.md).
    this.logger.log(
      this.agentsAudience
        ? `Agents gRPC ${this.agentsGrpcUrl} — OIDC activo (audience: ${this.agentsAudience})`
        : `Agents gRPC ${this.agentsGrpcUrl} — sin OIDC`,
    );
  }

  onModuleInit() {
    const packageDef = protoLoader.loadSync(
      join(__dirname, '../../../../../packages/contracts/proto/agents/v1/agents.proto'),
      { keepCase: true, longs: Number, defaults: true, oneofs: true },
    );
    const proto = grpc.loadPackageDefinition(packageDef) as any;
    this.grpcClient = new proto.tesseract.agents.v1.AgentsService(
      this.agentsGrpcUrl,
      this.agentsGrpcUseTls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure(),
    );
  }

  private async buildMetadata(): Promise<grpc.Metadata> {
    const metadata = new grpc.Metadata();
    if (this.internalSecret) metadata.add('x-internal-token', this.internalSecret);
    if (!this.agentsAudience) return metadata;

    try {
      // Un solo IdTokenClient para todo el proceso. `getIdTokenClient()` construye una
      // instancia nueva en cada llamada y la caché del token vive en la instancia, así que
      // pedirlo por petición sería un viaje al metadata server en cada mensaje. Memorizado,
      // la librería refresca sola y no hace falta caché propia.
      this.idTokenClient ??= this.auth.getIdTokenClient(this.agentsAudience);
      const headers = await (await this.idTokenClient).getRequestHeaders();
      const authorization = headers.get('authorization');
      if (authorization) metadata.add('authorization', authorization);
    } catch (error) {
      // Sin esto, un tropiezo del metadata server en la primera llamada deja memorizada una
      // promesa rechazada y el Gateway no vuelve a mandar token hasta que alguien lo reinicie.
      this.idTokenClient = undefined;
      throw error;
    }

    return metadata;
  }

  /**
   * Los campos dinámicos del proto (graph_config, user_metadata, config/credentials
   * de cada tool, y por agente: model_params + signal_tools) viajan como JSON string.
   * Aquí los serializamos antes de enviar.
   */
  private toWireRequest(request: AgentExecutionRequestDto): Record<string, any> {
    const toJson = (value: unknown): string =>
      value === undefined || value === null ? '' : JSON.stringify(value);

    // El proto define agent_tool_instances como map<string, AgentToolMap>,
    // donde AgentToolMap = { tools: map<string, ToolInstance> }. Envolvemos bajo `tools`.
    const agentToolInstances: Record<string, { tools: Record<string, any> }> = {};
    for (const [agentName, tools] of Object.entries(request.agent_tool_instances ?? {})) {
      const wrappedTools: Record<string, any> = {};
      for (const [toolId, tool] of Object.entries(tools)) {
        wrappedTools[toolId] = {
          ...tool,
          config: toJson(tool.config),
          credentials: toJson(tool.credentials),
        };
      }
      agentToolInstances[agentName] = { tools: wrappedTools };
    }

    // El proto AgentConfig no tiene campos para model_params ni signal_tools:
    // viajan como JSON string (model_params_json / signal_tools_json). temperature
    // se deja tal cual — si el agente no la trae, el campo `optional` queda ausente.
    const agentsConfig: Record<string, any> = {};
    for (const [agentName, cfg] of Object.entries(request.agents_config ?? {})) {
      const { model_params, signal_tools, tools, ...rest } = (cfg ?? {}) as Record<string, any>;
      void tools; // `tools` no viaja en AgentConfig (se resuelve vía agent_tool_instances)
      agentsConfig[agentName] = {
        ...rest,
        model_params_json: toJson(model_params),
        signal_tools_json: toJson(signal_tools),
      };
    }

    return {
      ...request,
      graph_config: toJson(request.graph_config),
      user_metadata: toJson((request as Record<string, any>).user_metadata),
      agent_tool_instances: agentToolInstances,
      agents_config: agentsConfig,
    };
  }

  private isRetryableGrpcError(err: any): boolean {
    return err?.code === grpc.status.UNAVAILABLE || err?.code === grpc.status.DEADLINE_EXCEEDED;
  }

  private toHttpException(err: any) {
    if (err?.code === grpc.status.UNAVAILABLE)
      return new ServiceUnavailableException('Agents service is not available');
    if (err?.code === grpc.status.DEADLINE_EXCEEDED)
      return new RequestTimeoutException('Agent execution timed out');
    return new InternalServerErrorException((err as Error)?.message ?? 'Unknown error');
  }

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
        if (!this.isRetryableGrpcError(error)) throw this.toHttpException(error);
        if (attempt < maxRetries) {
          this.logger.warn(
            `[${context}] Agents service not ready (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${retryDelayMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }
    throw this.toHttpException(lastError);
  }

  async execute(request: AgentExecutionRequestDto): Promise<AgentExecutionResponseDto> {
    this.logger.debug(
      `Executing agent for tenant: ${request.tenant_id}, workflow: ${request.workflow_id}`,
    );

    const wireRequest = this.toWireRequest(request);

    return this.withRetry(async () => {
      const metadata = await this.buildMetadata();
      return new Promise<AgentExecutionResponseDto>((resolve, reject) => {
        const deadline = new Date(Date.now() + this.agentsServiceTimeout);
        this.grpcClient.execute(
          wireRequest,
          metadata,
          { deadline },
          (err: any, response: any) => {
            if (err) return reject(err);
            resolve(this.mapExecutionResponse(response));
          },
        );
      });
    }, 'execute');
  }

  async executeStream(request: AgentExecutionRequestDto): Promise<NodeJS.ReadableStream> {
    this.logger.debug(
      `Executing streaming agent for tenant: ${request.tenant_id}, workflow: ${request.workflow_id}`,
    );
    return this.grpcClient.executeStream(
      this.toWireRequest(request),
      await this.buildMetadata(),
    ) as NodeJS.ReadableStream;
  }

  /**
   * Catálogo autodescriptivo de tipos de nodo del motor (JSON Schema por tipo,
   * puertos, contrato de templates). Se usa para validar workflows al guardarlos
   * y será la fuente del futuro editor visual.
   */
  async getNodeCatalog(graphType = 'pipeline'): Promise<Record<string, any>> {
    return this.withRetry(async () => {
      const metadata = await this.buildMetadata();
      return new Promise<Record<string, any>>((resolve, reject) => {
        const deadline = new Date(Date.now() + 10000);
        this.grpcClient.getNodeCatalog(
          { graph_type: graphType },
          metadata,
          { deadline },
          (err: any, response: any) => {
            if (err) return reject(err);
            try {
              resolve(JSON.parse(response.catalog_json ?? '{}'));
            } catch (parseError) {
              reject(parseError);
            }
          },
        );
      });
    }, 'getNodeCatalog', 1);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await new Promise<void>((resolve, reject) => {
        const deadline = new Date(Date.now() + 5000);
        this.grpcClient.waitForReady(deadline, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      return true;
    } catch {
      this.logger.warn('Agents gRPC health check failed');
      return false;
    }
  }

  private mapExecutionResponse(response: any): AgentExecutionResponseDto {
    const meta = response.metadata;
    return {
      conversation_id: response.conversation_id,
      messages: (response.messages ?? []).map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
      metadata: meta
        ? {
            execution_time_ms: meta.execution_time_ms,
            graph_type: meta.graph_type,
            agents_count: meta.agents_count,
            input_tokens: meta.input_tokens,
            output_tokens: meta.output_tokens,
            total_tokens: meta.total_tokens,
            usage_by_model: meta.usage_by_model,
            human_handoff_requested: meta.human_handoff_requested,
            variables_json: meta.variables_json,
          }
        : undefined,
    };
  }
}

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

  constructor(private readonly configService: ConfigService) {
    const configuredUrl = this.configService.get<string>('AGENTS_GRPC_URL', 'localhost:50051');
    this.agentsGrpcUseTls = configuredUrl.startsWith('https://');
    this.agentsGrpcUrl = configuredUrl.replace(/^https?:\/\//, '');
    this.agentsServiceTimeout = this.configService.get<number>('AGENTS_SERVICE_TIMEOUT', 30000);
    this.internalSecret = this.configService.get<string>('AGENTS_INTERNAL_SECRET', '');
    this.logger.log(`Agents gRPC URL: ${this.agentsGrpcUrl}`);
  }

  onModuleInit() {
    const packageDef = protoLoader.loadSync(
      join(__dirname, '../../../../packages/contracts/proto/agents/v1/agents.proto'),
      { keepCase: true, longs: Number, defaults: true, oneofs: true },
    );
    const proto = grpc.loadPackageDefinition(packageDef) as any;
    this.grpcClient = new proto.tesseract.agents.v1.AgentsService(
      this.agentsGrpcUrl,
      this.agentsGrpcUseTls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure(),
    );
  }

  private buildMetadata(): grpc.Metadata {
    const metadata = new grpc.Metadata();
    if (this.internalSecret) metadata.add('x-internal-token', this.internalSecret);
    return metadata;
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

    return this.withRetry(() => {
      return new Promise<AgentExecutionResponseDto>((resolve, reject) => {
        const deadline = new Date(Date.now() + this.agentsServiceTimeout);
        this.grpcClient.execute(
          request,
          this.buildMetadata(),
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
    return this.grpcClient.executeStream(request, this.buildMetadata()) as NodeJS.ReadableStream;
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
          }
        : undefined,
    };
  }
}

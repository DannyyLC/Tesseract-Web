import { TriggerType } from '@tesseract/database';
import { ApiKeyGuard } from '@/identity/auth/guards/api-key.guard';
import {
  Controller,
  ForbiddenException,
  BadRequestException,
  UseGuards,
  Param,
  Body,
  Post,
  HttpCode,
  HttpStatus,
  Header,
  StreamableFile,
} from '@nestjs/common';
import { WorkflowsService } from '../../workflows.service';
import { ApiKeyPayload } from '@/platform/common/types/api-key-payload.type';
import { CurrentApiKey } from '@/identity/auth/decorators/current-api-key.decorator';
import { ExecuteWorkflowDto } from '../../dto';
import { readExecutionResult } from '@/automation/executions/execution-result';

@Controller('v1/workflows')
@UseGuards(ApiKeyGuard)
export class ExternalWorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  /**
   * POST /workflows/:id/execute
   * Ejecutar un workflow usando API Key
   *
   * Headers requeridos:
   *   X-API-Key: ak_live_xxx...
   */
  @Post(':id/execute')
  @HttpCode(HttpStatus.CREATED)
  async execute(
    @CurrentApiKey() apiKey: ApiKeyPayload,
    @Param('id') id: string,
    @Body() executeDto: ExecuteWorkflowDto,
  ) {
    const targetWorkflowId = this.resolveWorkflowId(apiKey, id);

    const execution = await this.workflowsService.execute(
      apiKey.organizationId,
      targetWorkflowId,
      executeDto.input,
      executeDto.metadata,
      undefined, // userId (no hay user real)
      undefined, // whatsappData
      apiKey.apiKeyId, // apiKeyId
      TriggerType.API, // trigger: External API executions are api
    );

    // Transformar respuesta para ocultar metadata interna (DTO simplificado)
    const result = readExecutionResult(execution.result);
    const messages = result?.messages ?? [];
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const assistantContent = lastMessage?.role === 'assistant' ? lastMessage.content : null;

    return {
      content: assistantContent,
      metadata: {
        execution_time_ms: result?.metadata?.execution_time_ms,
      },
    };
  }

  /**
   * POST /workflows/:id/execute/stream
   * Ejecutar un workflow en modo streaming usando API Key
   *
   * Headers requeridos:
   *   X-API-Key: ak_live_xxx...
   * Retorna: Content-Type: text/event-stream
   */
  @Post(':id/execute/stream')
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  @Header('X-Accel-Buffering', 'no')
  async executeStream(
    @CurrentApiKey() apiKey: ApiKeyPayload,
    @Param('id') id: string,
    @Body() executeDto: ExecuteWorkflowDto,
  ): Promise<StreamableFile> {
    const targetWorkflowId = this.resolveWorkflowId(apiKey, id);

    const stream = await this.workflowsService.executeStream(
      apiKey.organizationId,
      targetWorkflowId,
      executeDto.input,
      executeDto.metadata,
      undefined, // userId
      apiKey.apiKeyId, // apiKeyId
      TriggerType.API, // trigger: External API executions are api
    );

    return new StreamableFile(stream as any);
  }

  /**
   * Resuelve el workflow a ejecutar y lo acota al de la key.
   *
   * Una key creada para un workflow solo ejecuta ese workflow: antes, el `:id` de la URL mandaba
   * y la key de un workflow servía para cualquier otro de la organización. Una key sin workflow
   * sigue valiendo para toda la organización.
   */
  private resolveWorkflowId(apiKey: ApiKeyPayload, id: string): string {
    // En endpoints externos, si id es 'current', usamos el de la key
    if (id === 'current') {
      if (!apiKey.workflowId) {
        throw new BadRequestException(
          "Esta API key no está ligada a un workflow: usa su id en lugar de 'current'",
        );
      }
      return apiKey.workflowId;
    }
    if (apiKey.workflowId && apiKey.workflowId !== id) {
      throw new ForbiddenException('Esta API key no tiene acceso a este workflow');
    }
    return id;
  }
}

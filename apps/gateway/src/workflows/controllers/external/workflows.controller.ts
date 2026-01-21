import { ApiKeyGuard } from "../../../auth/guards/api-key.guard";
import { Controller, UseGuards, Param, Body, Post, HttpCode, HttpStatus, Header, StreamableFile } from "@nestjs/common";
import { WorkflowsService } from "../../../workflows/workflows.service";
import { ApiKeyPayload } from "../../../common/types/api-key-payload.type";
import { CurrentApiKey } from "../../../auth/decorators/current-api-key.decorator";
import { ExecuteWorkflowDto } from "../../../workflows/dto";

@Controller('v1/workflows')
@UseGuards(ApiKeyGuard)
export class ExternalWorkflowsController {
    constructor(
        private readonly workflowsService: WorkflowsService,
    ) { }


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
        // En endpoints externos, si id es 'current', usamos el de la key
        const targetWorkflowId = id === 'current' ? apiKey.workflowId : id;

        const execution = await this.workflowsService.execute(
            apiKey.organizationId,
            targetWorkflowId,
            executeDto.input,
            executeDto.metadata,
            undefined, // userId (no hay user real)
            apiKey.apiKeyId, // apiKeyId
        );

        // Transformar respuesta para ocultar metadata interna (DTO simplificado)
        const result = execution.result as any;
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
    async executeStream(
        @CurrentApiKey() apiKey: ApiKeyPayload,
        @Param('id') id: string,
        @Body() executeDto: ExecuteWorkflowDto,
    ): Promise<StreamableFile> {
        // En endpoints externos, si id es 'current', usamos el de la key
        const targetWorkflowId = id === 'current' ? apiKey.workflowId : id;

        const stream = await this.workflowsService.executeStream(
            apiKey.organizationId,
            targetWorkflowId,
            executeDto.input,
            executeDto.metadata,
            undefined, // userId
            apiKey.apiKeyId, // apiKeyId
        );

        return new StreamableFile(stream as any);
    }
}
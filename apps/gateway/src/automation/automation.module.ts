import { Module } from '@nestjs/common';
import { WorkflowsModule } from './workflows/workflows.module';
import { ExecutionsModule } from './executions/executions.module';
import { AgentsModule } from './agents/agents.module';
import { LlmModelsModule } from './llm-models/llm-models.module';
import { MediaProcessingModule } from './media-processing/media-processing.module';
import { ToolsModule } from './tools/core/tools.module';
import { ToolsCatalogModule } from './tools/catalog/tools-catalog.module';
import { TenantToolModule } from './tools/tenant/tenant-tool.module';
import { CronTriggersModule } from './cron-triggers/cron-triggers.module';

/**
 * Dominio del motor de ejecución. Agrupa y reexporta sus submódulos:
 * workflows, ejecuciones, agentes, modelos LLM, procesamiento de medios,
 * herramientas (core/catálogo/tenant) y cron-triggers.
 */
@Module({
  imports: [
    WorkflowsModule,
    ExecutionsModule,
    AgentsModule,
    LlmModelsModule,
    MediaProcessingModule,
    ToolsModule,
    ToolsCatalogModule,
    TenantToolModule,
    CronTriggersModule,
  ],
  exports: [
    WorkflowsModule,
    ExecutionsModule,
    AgentsModule,
    LlmModelsModule,
    MediaProcessingModule,
    ToolsModule,
    ToolsCatalogModule,
    TenantToolModule,
    CronTriggersModule,
  ],
})
export class AutomationModule {}

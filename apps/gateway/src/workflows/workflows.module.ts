import { Module } from '@nestjs/common';
import { WorkflowsController } from './controllers/user-ui/workflows.controller';
import { WorkflowsService } from './workflows.service';
import { ExecutionsModule } from '../executions/executions.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AgentsModule } from '../agents/agents.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { CreditsModule } from '../credits/credits.module';
import { LlmModelsModule } from '../llm-models/llm-models.module';
import { ExternalWorkflowsController } from './controllers/external/workflows.controller';
import { UtilityModule } from '../utility/utility.module';

/**
 * WorkflowsModule
 * Agrupa toda la funcionalidad relacionada con workflows
 */
@Module({
  imports: [
    UtilityModule,
    ExecutionsModule,
    OrganizationsModule,
    AgentsModule,
    ConversationsModule,
    CreditsModule,
    LlmModelsModule,
  ],
  controllers: [WorkflowsController, ExternalWorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}

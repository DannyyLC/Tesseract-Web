import { Module } from "@nestjs/common";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";
import { ExecutionsModule } from '../executions/executions.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AgentsModule } from "../agents/agents.module";
import { ConversationsModule } from '../conversations/conversations.module';
import { CreditBalanceService } from '../credits/credit.service';
import { LlmModelsService } from '../llm-models/llm-models.service';


/**
 * WorkflowsModule
 * Agrupa toda la funcionalidad relacionada con workflows
 */
@Module({
    imports: [ExecutionsModule, OrganizationsModule, AgentsModule, ConversationsModule],
    controllers: [WorkflowsController],
    providers: [WorkflowsService, CreditBalanceService, LlmModelsService],
    exports: [WorkflowsService],
})
export class WorkflowsModule {}

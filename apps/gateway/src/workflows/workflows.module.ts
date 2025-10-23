import { Module } from "@nestjs/common";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";

/**
 * WorkflowsModule
 * Agrupa toda la funcionalidad relacionada con workflows
 * 
 * Contiene:
 * - WorkflowsController: Maneja peticiones HTTP
 * - WorkflowsService: Lógica de negocio
 * 
 * Dependencias:
 * - PrismaService: Se inyecta automáticamente (es global)
 * - ApiKeyGuard: Se usa en el controller (está exportado por AuthModule)
 */
@Module({
    controllers: [WorkflowsController],
    providers: [WorkflowsService],
    exports: [WorkflowsService],
})
export class WorkflowsModule {}

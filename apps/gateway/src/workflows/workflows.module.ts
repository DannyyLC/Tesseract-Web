import { Module } from "@nestjs/common";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";
import { ExecutionsModule } from '../executions/executions.module';
import { N8nModule } from '../integrations/n8n/n8n.module';
import { OrganizationsModule } from '../organizations/organizations.module';

/**
 * WorkflowsModule
 * Agrupa toda la funcionalidad relacionada con workflows
 * 
 * Contiene:
 * - WorkflowsController: Maneja peticiones HTTP (CRUD + Execute)
 * - WorkflowsService: Lógica de negocio con validación de límites
 * 
 * Importa:
 * - ExecutionsModule: Para crear y actualizar ejecuciones
 * - N8nModule: Para ejecutar webhooks de n8n
 * - OrganizationsModule: Para validar límites según el plan
 * 
 * Dependencias inyectadas en WorkflowsService:
 * - PrismaService: Se inyecta automáticamente (es global)
 * - ExecutionsService: Desde ExecutionsModule
 * - N8nService: Desde N8nModule
 * - OrganizationsService: Desde OrganizationsModule
 * 
 * Exporta:
 * - WorkflowsService: Para que otros módulos puedan usarlo si necesitan
 */
@Module({
    imports: [ExecutionsModule, N8nModule, OrganizationsModule],
    controllers: [WorkflowsController],
    providers: [WorkflowsService],
    exports: [WorkflowsService],
})
export class WorkflowsModule {}

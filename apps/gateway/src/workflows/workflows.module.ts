import { Module } from "@nestjs/common";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";
import { ExecutionsModule } from '../executions/executions.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AgentsModule } from "../agents/agents.module";
import { CreditBalanceService } from '../credits/credit-balance.service';
import { ModelPricesService } from '../model-prices/model-prices.service';
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
 * - OrganizationsModule: Para validar límites según el plan
 * 
 * Dependencias inyectadas en WorkflowsService:
 * - PrismaService: Se inyecta automáticamente (es global)
 * - ExecutionsService: Desde ExecutionsModule
 * - OrganizationsService: Desde OrganizationsModule
 * - CreditBalanceService: Para validar y descontar créditos
 * - ModelPricesService: Para calcular costos en USD
 * 
 * Exporta:
 * - WorkflowsService: Para que otros módulos puedan usarlo si necesitan
 */
@Module({
    imports: [ExecutionsModule, OrganizationsModule, AgentsModule],
    controllers: [WorkflowsController],
    providers: [WorkflowsService, CreditBalanceService, ModelPricesService],
    exports: [WorkflowsService],
})
export class WorkflowsModule {}

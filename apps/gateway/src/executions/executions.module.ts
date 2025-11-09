import { Module } from '@nestjs/common';
import { ExecutionsService } from './executions.service';
import { ExecutionsController } from './executions.controller';

/**
 * ExecutionsModule
 * Agrupa toda la funcionalidad relacionada con ejecuciones
 * 
 * Contiene:
 * - ExecutionsService: Lógica de negocio de ejecuciones
 * - ExecutionsController: Endpoints para consultar y gestionar ejecuciones
 * 
 * Exporta:
 * - ExecutionsService: Para que WorkflowsModule pueda usarlo al ejecutar workflows
 * 
 * Dependencias:
 * - PrismaService: Se inyecta automáticamente (es global)
 */
@Module({
  controllers: [ExecutionsController],
  providers: [ExecutionsService],
  exports: [ExecutionsService], // ← Importante: exportar para usarlo en WorkflowsModule
})
export class ExecutionsModule {}
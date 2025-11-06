import { Module } from '@nestjs/common';
import { ExecutionsService } from './executions.service';

/**
 * ExecutionsModule
 * Agrupa toda la funcionalidad relacionada con ejecuciones
 * 
 * Contiene:
 * - ExecutionsService: Lógica de negocio de ejecuciones
 * - ExecutionsController: (lo agregaremos después para consultar ejecuciones)
 * 
 * Exporta:
 * - ExecutionsService: Para que WorkflowsModule pueda usarlo al ejecutar workflows
 * 
 * Dependencias:
 * - PrismaService: Se inyecta automáticamente (es global)
 */
@Module({
  providers: [ExecutionsService],
  exports: [ExecutionsService], // ← Importante: exportar para usarlo en WorkflowsModule
})
export class ExecutionsModule {}
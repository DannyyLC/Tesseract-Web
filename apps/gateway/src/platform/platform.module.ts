import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { UtilityModule } from './utility/utility.module';
import { SchedulingModule } from './scheduling/scheduling.module';

/**
 * Infraestructura compartida (cross-cutting). Agrupa y reexporta:
 * base de datos (Prisma, @Global), utilidades y tareas programadas.
 */
@Module({
  imports: [DatabaseModule, UtilityModule, SchedulingModule],
  exports: [DatabaseModule, UtilityModule],
})
export class PlatformModule {}

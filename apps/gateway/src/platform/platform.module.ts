import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { UtilityModule } from './utility/utility.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { SuperAdminModule } from './super-admin/super-admin.module';

/**
 * Infraestructura compartida (cross-cutting). Agrupa y reexporta:
 * base de datos (Prisma, @Global), utilidades, tareas programadas y
 * el bootstrap del super admin.
 */
@Module({
  imports: [DatabaseModule, UtilityModule, SchedulingModule, SuperAdminModule],
  exports: [DatabaseModule, UtilityModule],
})
export class PlatformModule {}

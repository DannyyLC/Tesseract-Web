import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { UtilityModule } from './utility/utility.module';

/**
 * Infraestructura compartida (cross-cutting). Agrupa y reexporta:
 * base de datos (Prisma, @Global) y utilidades.
 */
@Module({
  imports: [DatabaseModule, UtilityModule],
  exports: [DatabaseModule, UtilityModule],
})
export class PlatformModule {}

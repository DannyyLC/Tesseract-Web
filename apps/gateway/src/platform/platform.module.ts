import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { UtilityModule } from './utility/utility.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { WebhookDedupModule } from './webhooks/webhook-dedup.module';
import { HealthModule } from './health/health.module';

/**
 * Infraestructura compartida (cross-cutting). Agrupa y reexporta:
 * base de datos (Prisma, @Global), utilidades, tareas programadas,
 * el bootstrap del super admin, deduplicación de webhooks y health checks.
 */
@Module({
  imports: [
    DatabaseModule,
    UtilityModule,
    SchedulingModule,
    SuperAdminModule,
    WebhookDedupModule,
    HealthModule,
  ],
  exports: [DatabaseModule, UtilityModule, WebhookDedupModule],
})
export class PlatformModule {}

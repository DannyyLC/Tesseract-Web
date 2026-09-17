import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { UtilityModule } from './utility/utility.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { WebhookDedupModule } from './webhooks/webhook-dedup.module';
import { HealthModule } from './health/health.module';
import { AnnouncementsModule } from './announcements/announcements.module';

/**
 * Infraestructura compartida (cross-cutting). Agrupa y reexporta:
 * base de datos (Prisma, @Global), utilidades, tareas programadas,
 * el bootstrap del super admin, deduplicación de webhooks y health checks.
 *
 * `CloudStorageModule` no está aquí: no es `@Global` y cada dominio que escribe en un bucket
 * lo importa por su cuenta, de modo que quede a la vista quién lo hace.
 */
@Module({
  imports: [
    DatabaseModule,
    UtilityModule,
    SchedulingModule,
    SuperAdminModule,
    WebhookDedupModule,
    HealthModule,
    AnnouncementsModule,
  ],
  exports: [DatabaseModule, UtilityModule, WebhookDedupModule],
})
export class PlatformModule {}

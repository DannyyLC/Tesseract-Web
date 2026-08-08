import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CronJobsService } from './cron-jobs.service';
import { ToolsModule } from '@/automation/tools/core/tools.module';

/**
 * Tareas de mantenimiento programadas (cross-cutting). Agrupa los cron jobs
 * del sistema que tocan varios dominios (limpieza de verificaciones, tokens,
 * conversaciones y notificaciones). Registra el scheduler de Nest.
 */
@Module({
  imports: [ScheduleModule.forRoot(), ToolsModule],
  providers: [CronJobsService],
})
export class SchedulingModule {}

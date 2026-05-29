import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CronJobsService } from './cron-jobs.service';

/**
 * Tareas de mantenimiento programadas (cross-cutting). Agrupa los cron jobs
 * del sistema que tocan varios dominios (limpieza de verificaciones, tokens,
 * conversaciones y notificaciones). Registra el scheduler de Nest.
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [CronJobsService],
})
export class SchedulingModule {}

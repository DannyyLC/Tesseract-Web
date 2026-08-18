import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CronJobsService } from './cron-jobs.service';
import { ToolsModule } from '@/automation/tools/core/tools.module';
import { InvoiceModule } from '@/billing/invoice/invoice.module';

/**
 * Tareas de mantenimiento programadas (cross-cutting). Agrupa los cron jobs
 * del sistema que tocan varios dominios (limpieza de verificaciones, tokens,
 * conversaciones y notificaciones, reintento de timbrado de CFDI).
 * Registra el scheduler de Nest.
 */
@Module({
  imports: [ScheduleModule.forRoot(), ToolsModule, InvoiceModule],
  providers: [CronJobsService],
})
export class SchedulingModule {}

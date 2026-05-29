import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { TriggerType, WorkflowCronTrigger } from '@tesseract/database';
import { CronJob } from 'cron';
import { PrismaService } from '../../platform/database/prisma.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { CreateCronTriggerDto, UpdateCronTriggerDto } from './dto';

@Injectable()
export class CronTriggersService implements OnModuleInit {
  private readonly logger = new Logger(CronTriggersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly workflowsService: WorkflowsService,
  ) {}

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    this.logger.log('Loading active cron triggers from DB...');
    const triggers = await this.prisma.workflowCronTrigger.findMany({
      where: { isActive: true },
    });
    for (const trigger of triggers) {
      try {
        this.scheduleTrigger(trigger);
      } catch (err) {
        this.logger.error(
          `Failed to register cron trigger "${trigger.id}" (${trigger.cronExpression}): ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(`Registered ${triggers.length} cron trigger(s).`);
  }

  // ─── Public CRUD ──────────────────────────────────────────────────────────

  async create(organizationId: string, dto: CreateCronTriggerDto): Promise<WorkflowCronTrigger> {
    this.validateCronExpression(dto.cronExpression);
    if (dto.timezone) this.validateTimezone(dto.timezone);

    const workflow = await this.prisma.workflow.findFirst({
      where: { id: dto.workflowId, organizationId, deletedAt: null },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');

    if (dto.whatsAppConfigId) {
      const wac = await this.prisma.whatsAppConfig.findFirst({
        where: { id: dto.whatsAppConfigId, organizationId },
      });
      if (!wac) throw new NotFoundException('WhatsApp config not found');
    }

    const tz = dto.timezone ?? 'UTC';
    const trigger = await this.prisma.workflowCronTrigger.create({
      data: {
        name: dto.name,
        cronExpression: dto.cronExpression,
        timezone: tz,
        triggerMessage: dto.triggerMessage,
        workflowId: dto.workflowId,
        whatsAppConfigId: dto.whatsAppConfigId ?? null,
        organizationId,
        isActive: dto.isActive ?? true,
        nextRunAt: this.calcNextRunAt(dto.cronExpression, tz),
      },
    });

    if (trigger.isActive) this.scheduleTrigger(trigger);
    return trigger;
  }

  async update(
    organizationId: string,
    triggerId: string,
    dto: UpdateCronTriggerDto,
  ): Promise<WorkflowCronTrigger> {
    const trigger = await this.findOwnedOrFail(triggerId, organizationId);

    if (dto.cronExpression) this.validateCronExpression(dto.cronExpression);
    if (dto.timezone) this.validateTimezone(dto.timezone);

    if (dto.whatsAppConfigId) {
      const wac = await this.prisma.whatsAppConfig.findFirst({
        where: { id: dto.whatsAppConfigId, organizationId },
      });
      if (!wac) throw new NotFoundException('WhatsApp config not found');
    }

    const newCron = dto.cronExpression ?? trigger.cronExpression;
    const newTz = dto.timezone ?? trigger.timezone;

    const updated = await this.prisma.workflowCronTrigger.update({
      where: { id: triggerId },
      data: { ...dto, nextRunAt: this.calcNextRunAt(newCron, newTz) },
    });

    this.unscheduleTrigger(triggerId);
    if (updated.isActive) this.scheduleTrigger(updated);
    return updated;
  }

  async delete(organizationId: string, triggerId: string): Promise<void> {
    await this.findOwnedOrFail(triggerId, organizationId);
    this.unscheduleTrigger(triggerId);
    await this.prisma.workflowCronTrigger.delete({ where: { id: triggerId } });
  }

  async setActive(
    organizationId: string,
    triggerId: string,
    isActive: boolean,
  ): Promise<WorkflowCronTrigger> {
    await this.findOwnedOrFail(triggerId, organizationId);

    const updated = await this.prisma.workflowCronTrigger.update({
      where: { id: triggerId },
      data: { isActive },
    });

    if (isActive) {
      this.unscheduleTrigger(triggerId);
      this.scheduleTrigger(updated);
    } else {
      this.unscheduleTrigger(triggerId);
    }
    return updated;
  }

  async listByOrg(organizationId: string): Promise<WorkflowCronTrigger[]> {
    return this.prisma.workflowCronTrigger.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, triggerId: string): Promise<WorkflowCronTrigger> {
    return this.findOwnedOrFail(triggerId, organizationId);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async findOwnedOrFail(
    triggerId: string,
    organizationId: string,
  ): Promise<WorkflowCronTrigger> {
    const trigger = await this.prisma.workflowCronTrigger.findFirst({
      where: { id: triggerId, organizationId },
    });
    if (!trigger) throw new NotFoundException(`Cron trigger ${triggerId} not found`);
    return trigger;
  }

  private scheduleTrigger(trigger: WorkflowCronTrigger): void {
    const jobName = this.jobKey(trigger.id);

    // Idempotent: evict stale job if it already exists (e.g. hot-reload)
    if (this.schedulerRegistry.doesExist('cron', jobName)) {
      this.schedulerRegistry.deleteCronJob(jobName);
    }

    const job = new CronJob(
      trigger.cronExpression,
      () => void this.executeTrigger(trigger.id),
      null,
      true,
      trigger.timezone,
    );

    this.schedulerRegistry.addCronJob(jobName, job);
    this.logger.log(
      `Scheduled cron trigger "${trigger.name}" [${trigger.id}] — ${trigger.cronExpression} (${trigger.timezone})`,
    );
  }

  private unscheduleTrigger(triggerId: string): void {
    const jobName = this.jobKey(triggerId);
    if (this.schedulerRegistry.doesExist('cron', jobName)) {
      this.schedulerRegistry.deleteCronJob(jobName);
      this.logger.log(`Unscheduled cron trigger ${triggerId}`);
    }
  }

  private async executeTrigger(triggerId: string): Promise<void> {
    const now = new Date();

    // Reload from DB — avoids acting on stale closure data
    const trigger = await this.prisma.workflowCronTrigger.findUnique({
      where: { id: triggerId },
    });

    if (!trigger || !trigger.isActive) {
      this.logger.warn(`Cron trigger ${triggerId} fired but is no longer active. Skipping.`);
      return;
    }

    this.logger.log(
      `Cron trigger "${trigger.name}" [${triggerId}] fired for workflow ${trigger.workflowId}`,
    );

    // Update timestamps before executing so a slow workflow doesn't delay the display
    await this.prisma.workflowCronTrigger.update({
      where: { id: triggerId },
      data: {
        lastRunAt: now,
        nextRunAt: this.calcNextRunAt(trigger.cronExpression, trigger.timezone),
      },
    });

    try {
      await this.workflowsService.execute(
        trigger.organizationId,
        trigger.workflowId,
        { message: trigger.triggerMessage },
        {
          channel: 'CRON',
          cronTriggerId: triggerId,
          ...(trigger.whatsAppConfigId && { whatsAppConfigId: trigger.whatsAppConfigId }),
        },
        undefined,
        undefined,
        undefined,
        TriggerType.SCHEDULE,
      );
    } catch (err) {
      // Never rethrow — a cron execution error must not crash the scheduler
      this.logger.error(
        `Cron trigger "${trigger.name}" [${triggerId}] execution failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private jobKey(triggerId: string): string {
    return `workflow_cron_trigger_${triggerId}`;
  }

  private calcNextRunAt(cronExpression: string, timezone: string): Date {
    const job = new CronJob(cronExpression, () => {}, null, false, timezone);
    return job.nextDate().toJSDate();
  }

  private validateCronExpression(expr: string): void {
    try {
      new CronJob(expr, () => {});
    } catch {
      throw new Error(`Invalid cron expression: "${expr}"`);
    }
  }

  private validateTimezone(tz: string): void {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
      throw new Error(`Invalid timezone: "${tz}"`);
    }
  }
}

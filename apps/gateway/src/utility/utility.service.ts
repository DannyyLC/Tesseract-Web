import { PrismaService } from '../database/prisma.service';
import { Inject, Injectable, MessageEvent } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Subject } from 'rxjs';
import { Logger } from 'winston';

@Injectable()
export class UtilityService {
  private readonly appNotificationsSubject = new Subject<MessageEvent>();

  constructor(
    private readonly prismaService: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async hashPassword(password: string): Promise<string> {
    const SALT_ROUNDS = 10;
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  removeIdFromObject<T extends { id?: unknown }>(obj: T): Omit<T, 'id'> {
    const { id: _id, ...rest } = obj;
    return rest;
  }

  removeIdFromArray<T extends { id?: unknown }>(arr: T[]): Omit<T, 'id'>[] {
    return arr.map(({ id: _id, ...rest }) => rest);
  }

  async sendNotificationToAppClients(
    organizationId: string,
    userRoles: string[],
    notificationCode: string,
    customDescArguments?: string[],
  ): Promise<void> {
    try {
      const notification = await this.prismaService.notification.findFirst({
        where: {
          code: notificationCode,
          isActive: true,
        },
        orderBy: {
          version: 'desc',
        },
        select: {
          id: true,
          titleTemplate: true,
          messageTemplate: true,
          targetRoles: true,
        },
      });

      if (!notification) {
        throw new Error(
          `Notification code ${notificationCode} does not exist as an active template in notifications table`,
        );
      }

      const args = customDescArguments ?? [];
      const placeholdersCount = this.countTemplatePlaceholders(notification.messageTemplate);
      if (args.length !== placeholdersCount) {
        throw new Error(
          `Notification code ${notificationCode} expects ${placeholdersCount} arguments, but received ${args.length}`,
        );
      }

      const messageSnapshot = this.applyTemplateArguments(notification.messageTemplate, args);
      const titleSnapshot = notification.titleTemplate;
      const templateRoles = this.normalizeRoleList(notification.targetRoles);
      const requestedRoles = this.normalizeRoleList(userRoles);
      const rolesToNotify =
        requestedRoles.length > 0
          ? requestedRoles.filter((role) => templateRoles.includes(role))
          : templateRoles;

      if (rolesToNotify.length === 0) {
        this.logger.warn(
          `UtilityService - sendNotificationToAppClients >> Notification code ${notificationCode} has no matching roles to notify`,
        );
        return;
      }

      const users = await this.prismaService.user.findMany({
        where: {
          organizationId,
          role: {
            in: rolesToNotify as any,
          },
        },
        select: {
          id: true,
        },
      });

      if (users.length === 0) {
        return;
      }

      const notificationEntries = users.map((user) => ({
        userId: user.id,
        notificationId: notification.id,
        organizationId: organizationId,
        isRead: false,
        titleSnapshot,
        messageSnapshot,
      }));

      await this.prismaService.userNotification.createMany({
        data: notificationEntries,
      });
    } catch (error) {
      this.logger.error(
        'UtilityService - sendNotificationToAppClients >> Error sending notification to app clients:',
        error,
      );
    }
  }

  private countTemplatePlaceholders(template: string): number {
    return (template.match(/%s/g) ?? []).length;
  }

  private applyTemplateArguments(template: string, args: string[]): string {
    let renderedTemplate = template;
    for (const arg of args) {
      renderedTemplate = renderedTemplate.replace('%s', arg);
    }
    return renderedTemplate;
  }

  private normalizeRoleList(roles: unknown): string[] {
    if (!Array.isArray(roles)) {
      return [];
    }

    return roles
      .filter((role): role is string => typeof role === 'string')
      .map((role) => role.toUpperCase());
  }

  getAppNotificationsSubject(): Subject<MessageEvent> {
    return this.appNotificationsSubject;
  }
}

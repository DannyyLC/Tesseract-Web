import { notificationsEnum } from '../events/app-notifications/notifications.enum';
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
      const notificationDetails =
        notificationsEnum[notificationCode as keyof typeof notificationsEnum];
      if (!notificationDetails) {
        throw new Error(
          `Notification code ${notificationCode} is not defined in notificationsEnum`,
        );
      }

      const args = customDescArguments ?? [];
      const placeholdersCount = this.countTemplatePlaceholders(notificationDetails.desc);
      if (args.length !== placeholdersCount) {
        throw new Error(
          `Notification code ${notificationCode} expects ${placeholdersCount} arguments, but received ${args.length}`,
        );
      }

      const messageSnapshot = this.applyTemplateArguments(notificationDetails.desc, args);
      const titleSnapshot = notificationDetails.title;

      const users = await this.prismaService.user.findMany({
        where: {
          organizationId,
          role: {
            in: userRoles.map((r) => r.toUpperCase() as any),
          },
        },
        select: {
          id: true,
        },
      });

      const notification = await this.prismaService.notification.findUnique({
        where: {
          code: notificationCode,
        },
        select: {
          id: true,
        },
      });

      if (!notification) {
        throw new Error(
          `Notification code ${notificationCode} does not exist in notifications table`,
        );
      }

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

  getAppNotificationsSubject(): Subject<MessageEvent> {
    return this.appNotificationsSubject;
  }
}

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
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger
  ) {}

  async hashPassword(password: string): Promise<string> {
    const SALT_ROUNDS = 10;
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async removeIdFromObject<T extends { id?: any }>(obj: T): Promise<Omit<T, 'id'>> {
    const { id, ...rest } = obj;
    return rest;
  }

  async removeIdFromArray<T extends { id?: any }>(arr: T[]): Promise<Omit<T, 'id'>[]> {
    return arr.map(({ id, ...rest }) => rest);
  }

  async sendNotificationToAppClients(
    organizationId: string,
    userRoles: string[],
    notificationCode: string,
  ): Promise<void> {
    try {
      const users = await this.prismaService.user.findMany({
        where: {
          organizationId,
          role: {
            in: userRoles,
          },
        },
        select: {
          id: true,
        },
      });

      const notification = await this.prismaService.notification.findFirst({
        where: {
          code: notificationCode,
        },
        select: {
          id: true,
        },
      });

      if (notification && users.length > 0) {
        const notificationEntries = users.map((user) => ({
          userId: user.id,
          notificationId: notification.id,
          isRead: false,
        }));
        await this.prismaService.userNotification.createMany({
          data: notificationEntries,
        });
        const notificationDetails = notificationsEnum[notificationCode as keyof typeof notificationsEnum]
        this.appNotificationsSubject.next({
          id: Date.now().toString(),
          data: {
            organizationId,
            roles: userRoles,
            notification: {
              id: notification.id,
              notificationCode,
              title: notificationDetails.title,
              desc: notificationDetails.desc,
            }
          },
          type: 'UserNotification.created',
          retry: 3000,
        });

      }
    } catch (error) {
      this.logger.error('UtilityService - sendNotificationToAppClients >> Error sending notification to app clients:', error);
    }
  }

  getAppNotificationsSubject(): Subject<MessageEvent> {
    return this.appNotificationsSubject;
  }
}

import { Module } from '@nestjs/common';
import { OrganizationsController } from './controllers/user-ui/organizations.controller';
import { OrganizationsService } from './organizations.service';
import { UtilityModule } from '@/platform/utility/utility.module';
import { NotificationsModule } from '@/messaging/notifications/notifications.module';

@Module({
  imports: [UtilityModule, NotificationsModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}

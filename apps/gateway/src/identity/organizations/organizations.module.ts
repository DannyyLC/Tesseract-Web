import { Module } from '@nestjs/common';
import { OrganizationsController } from './controllers/user-ui/organizations.controller';
import { OrganizationsAdminController } from './controllers/admin/organizations.admin.controller';
import { OrganizationsService } from './organizations.service';
import { UtilityModule } from '@/platform/utility/utility.module';
import { NotificationsModule } from '@/messaging/notifications/notifications.module';
import { TwoFactorModule } from '../two-factor/two-factor.module';

@Module({
  imports: [UtilityModule, NotificationsModule, TwoFactorModule],
  controllers: [OrganizationsController, OrganizationsAdminController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}

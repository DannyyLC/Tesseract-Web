import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './controllers/user-ui/users.controller';
import { UtilityModule } from '@/platform/utility/utility.module';
import { NotificationsModule } from '@/messaging/notifications/notifications.module';

@Module({
  imports: [UtilityModule, NotificationsModule],
  providers: [UsersService],
  exports: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}

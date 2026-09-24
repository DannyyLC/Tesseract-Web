import { Module } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementsReadService } from './announcements.read.service';
import { AnnouncementsAdminController } from './controllers/admin/announcements.admin.controller';
import { AnnouncementsController } from './controllers/user-ui/announcements.controller';

@Module({
  providers: [AnnouncementsService, AnnouncementsReadService],
  controllers: [AnnouncementsAdminController, AnnouncementsController],
})
export class AnnouncementsModule {}

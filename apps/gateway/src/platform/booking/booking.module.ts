import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/platform/database/database.module';
import { ToolsModule } from '@/automation/tools/core/tools.module';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingOauthService } from './booking-oauth.service';

@Module({
  imports: [DatabaseModule, ToolsModule],
  controllers: [BookingController],
  providers: [BookingService, BookingOauthService],
})
export class BookingModule {}

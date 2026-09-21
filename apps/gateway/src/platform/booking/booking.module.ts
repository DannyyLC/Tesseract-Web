import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingCalendarService } from './booking-calendar.service';

@Module({
  controllers: [BookingController],
  providers: [BookingService, BookingCalendarService],
})
export class BookingModule {}

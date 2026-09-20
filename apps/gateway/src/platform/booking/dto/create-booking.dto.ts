import { IsEmail, IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { BOOKING_EVENT_TYPE_IDS, BookingEventTypeId, CreateBookingDto } from '@tesseract/types';

export class CreateBookingRequestDto implements CreateBookingDto {
  @IsIn(BOOKING_EVENT_TYPE_IDS)
  eventTypeId: BookingEventTypeId;

  @IsISO8601()
  startTime: string;

  @IsString()
  @IsNotEmpty()
  attendeeName: string;

  @IsEmail()
  attendeeEmail: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

import { IsNotEmpty, IsString } from 'class-validator';
import { SelectBookingCalendarDto } from '@tesseract/types';

export class SelectBookingCalendarRequestDto implements SelectBookingCalendarDto {
  @IsString()
  @IsNotEmpty()
  calendarId: string;
}

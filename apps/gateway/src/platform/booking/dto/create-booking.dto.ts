import { IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { BOOKING_EVENT_TYPE_IDS, BookingEventTypeId, CreateBookingDto } from '@tesseract/types';

export class CreateBookingRequestDto implements CreateBookingDto {
  @IsIn(BOOKING_EVENT_TYPE_IDS)
  eventTypeId: BookingEventTypeId;

  @IsISO8601()
  startTime: string;

  // `attendeeName` y `notes` acaban en el `summary` y la `description` de un evento de Calendar
  // que Google reenvía por correo a los invitados: conviene acotarlos.
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  attendeeName: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;
}

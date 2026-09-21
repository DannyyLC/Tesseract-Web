import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import {
  ApiResponse,
  ApiResponseBuilder,
  BookingAvailabilityResponse,
  BookingConfirmation,
  BookingEventType,
} from '@tesseract/types';
import { BookingService } from './booking.service';
import { BOOKING_EVENT_TYPES, BOOKING_TIMEZONE } from './booking-event-types.config';
import { CreateBookingRequestDto } from './dto/create-booking.dto';

@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get('event-types')
  @UseGuards(JwtAuthGuard)
  getEventTypes(): ApiResponse<BookingEventType[]> {
    return new ApiResponseBuilder<BookingEventType[]>()
      .setData(Object.values(BOOKING_EVENT_TYPES))
      .build();
  }

  @Get('availability')
  @UseGuards(JwtAuthGuard)
  async getAvailability(
    @Query('eventTypeId') eventTypeId: string,
    @Query('date') date: string,
  ): Promise<ApiResponse<BookingAvailabilityResponse>> {
    if (!eventTypeId || !date) {
      throw new BadRequestException('eventTypeId and date are required');
    }
    const slots = await this.bookingService.getAvailability(eventTypeId, date);
    return new ApiResponseBuilder<BookingAvailabilityResponse>()
      .setData({ slots, timezone: BOOKING_TIMEZONE })
      .build();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async createBooking(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateBookingRequestDto,
  ): Promise<ApiResponse<BookingConfirmation>> {
    // El correo del invitado sale del token, nunca del cuerpo: si no, cualquier usuario
    // autenticado podría mandar invitaciones de Calendar a direcciones arbitrarias.
    const confirmation = await this.bookingService.createBooking(dto, user.email);
    return new ApiResponseBuilder<BookingConfirmation>().setData(confirmation).build();
  }
}

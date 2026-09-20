import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import {
  ApiResponse,
  ApiResponseBuilder,
  BookingAvailabilityResponse,
  BookingCalendarStatus,
  BookingConfirmation,
  BookingEventType,
  UserRole,
} from '@tesseract/types';
import { BookingService } from './booking.service';
import { BookingOauthService } from './booking-oauth.service';
import { BOOKING_EVENT_TYPES, BOOKING_TIMEZONE } from './booking-event-types.config';
import { CreateBookingRequestDto } from './dto/create-booking.dto';

@Controller('booking')
export class BookingController {
  private readonly logger = new Logger(BookingController.name);

  constructor(
    private readonly bookingService: BookingService,
    private readonly bookingOauthService: BookingOauthService,
    private readonly configService: ConfigService,
  ) {}

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
    @Body() dto: CreateBookingRequestDto,
  ): Promise<ApiResponse<BookingConfirmation>> {
    const confirmation = await this.bookingService.createBooking(dto);
    return new ApiResponseBuilder<BookingConfirmation>().setData(confirmation).build();
  }

  @Get('admin/connect-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  connectUrl(@CurrentUser() user: UserPayload, @Res() res: Response) {
    const authUrl = this.bookingOauthService.generateAuthUrl(user.sub);
    return res.redirect(authUrl);
  }

  @Get('admin/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async status(): Promise<ApiResponse<BookingCalendarStatus>> {
    const status = await this.bookingOauthService.getStatus();
    return new ApiResponseBuilder<BookingCalendarStatus>().setData(status).build();
  }

  @Delete('admin/disconnect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async disconnect(): Promise<ApiResponse<boolean>> {
    await this.bookingOauthService.disconnect();
    return new ApiResponseBuilder<boolean>().setData(true).build();
  }

  @Get('admin/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    const redirectBase = `${frontendUrl}/admin/calendario`;

    if (error) {
      this.logger.warn(`Booking calendar OAuth denied: ${error}`);
      return res.redirect(`${redirectBase}?calendarError=access_denied`);
    }
    if (!code || !state) {
      return res.redirect(`${redirectBase}?calendarError=missing_code`);
    }

    try {
      await this.bookingOauthService.handleCallback(code, state);
      return res.redirect(`${redirectBase}?calendarConnected=1`);
    } catch (err: any) {
      this.logger.error(
        `Booking calendar OAuth callback failed: ${err?.message} status=${err?.response?.status} body=${JSON.stringify(err?.response?.data)}`,
      );
      return res.redirect(`${redirectBase}?calendarError=callback_failed`);
    }
  }
}

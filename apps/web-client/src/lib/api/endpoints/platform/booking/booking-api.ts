import ApiRequestManager from '../../../api-request-manager';
import {
  ApiResponse,
  BookingAvailabilityResponse,
  BookingEventType,
  CreateBookingDto,
  BookingConfirmation,
} from '@tesseract/types';

class BookingApi {
  public apiRequestManager: ApiRequestManager;

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  public async getEventTypes(): Promise<BookingEventType[]> {
    const result = await this.apiRequestManager.get<ApiResponse<BookingEventType[]>>(
      '/booking/event-types',
    );
    return result.data.data ?? [];
  }

  public async getAvailability(
    eventTypeId: string,
    date: string,
  ): Promise<BookingAvailabilityResponse> {
    const result = await this.apiRequestManager.get<ApiResponse<BookingAvailabilityResponse>>(
      `/booking/availability?eventTypeId=${encodeURIComponent(eventTypeId)}&date=${encodeURIComponent(date)}`,
    );
    return result.data.data ?? { slots: [], timezone: 'America/Mexico_City' };
  }

  public async createBooking(dto: CreateBookingDto): Promise<BookingConfirmation> {
    const result = await this.apiRequestManager.post<ApiResponse<BookingConfirmation>>(
      '/booking',
      dto,
    );
    return result.data.data as BookingConfirmation;
  }
}

export default BookingApi;

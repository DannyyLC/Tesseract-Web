import ApiRequestManager from '../../../api-request-manager';
import {
  ApiResponse,
  BookingCalendarListItem,
  BookingCalendarStatus,
  SelectBookingCalendarDto,
} from '@tesseract/types';

/**
 * Separado de `BookingApi` (que sirve el widget de reservas dentro del dashboard de cualquier
 * tenant) porque estos endpoints son SUPER_ADMIN-only: gestionan la única cuenta de Google
 * conectada como agenda propia de Tesseract, no una integración por cliente.
 */
class BookingAdminApi {
  public apiRequestManager: ApiRequestManager;

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  public async getStatus(): Promise<BookingCalendarStatus> {
    const result = await this.apiRequestManager.get<ApiResponse<BookingCalendarStatus>>(
      '/booking/admin/status',
    );
    return result.data.data as BookingCalendarStatus;
  }

  /**
   * Endpoint de solo redirect (302 a Google): se navega el browser hacia él directamente, no
   * se hace fetch. La cookie httpOnly de auth viaja igual en una navegación normal.
   */
  public getConnectUrl(): string {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api';
    return `${base}/booking/admin/connect-url`;
  }

  public redirectToConnect(): void {
    window.location.href = this.getConnectUrl();
  }

  public async disconnect(): Promise<boolean> {
    const result = await this.apiRequestManager.delete<ApiResponse<boolean>>(
      '/booking/admin/disconnect',
    );
    return result.data.data ?? false;
  }

  public async getCalendars(): Promise<BookingCalendarListItem[]> {
    const result = await this.apiRequestManager.get<ApiResponse<BookingCalendarListItem[]>>(
      '/booking/admin/calendars',
    );
    return result.data.data ?? [];
  }

  public async selectCalendar(calendarId: string): Promise<BookingCalendarStatus> {
    const body: SelectBookingCalendarDto = { calendarId };
    const result = await this.apiRequestManager.patch<ApiResponse<BookingCalendarStatus>>(
      '/booking/admin/calendar',
      body,
    );
    return result.data.data as BookingCalendarStatus;
  }
}

export default BookingAdminApi;

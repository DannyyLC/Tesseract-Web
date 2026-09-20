import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { google } from 'googleapis';
import { PrismaService } from '@/platform/database/prisma.service';
import { KmsService } from '@/automation/tools/core/kms.service';
import { BookingCalendarListItem, BookingCalendarStatus } from '@tesseract/types';

const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
];

/**
 * Conecta, una sola vez, la cuenta de Google del equipo de ventas/soporte que reemplaza a
 * Cal.com. A diferencia de `ToolsOauthService` (una credencial por tenant/tool), aquí hay una
 * única fila: es la agenda propia de Tesseract, no una integración por cliente.
 */
@Injectable()
export class BookingOauthService {
  private readonly logger = new Logger(BookingOauthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly kms: KmsService,
  ) {}

  generateAuthUrl(connectedByUserId: string): string {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new Error('GOOGLE_CLIENT_ID not configured');
    }

    const state = Buffer.from(JSON.stringify({ u: connectedByUserId })).toString('base64');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.getRedirectUri(),
      response_type: 'code',
      scope: CALENDAR_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<void> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured');
    }

    let connectedByUserId: string | undefined;
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      connectedByUserId = decoded.u;
    } catch {
      throw new BadRequestException('Invalid OAuth state');
    }

    const { data } = await axios
      .post('https://oauth2.googleapis.com/token', {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: this.getRedirectUri(),
        grant_type: 'authorization_code',
      })
      .catch((error) => {
        this.logger.error(
          `Error exchanging Google code. status=${error?.response?.status} body=${JSON.stringify(error?.response?.data)}`,
        );
        throw new BadRequestException('Failed to exchange authorization code with Google');
      });

    if (!data.refresh_token) {
      throw new BadRequestException(
        'Google no devolvió un refresh token. Revoca el acceso previo en myaccount.google.com/permissions y vuelve a intentar.',
      );
    }

    const { data: profile } = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });

    const encryptedRefreshToken = await this.kms.encrypt(data.refresh_token);
    const scopes = data.scope ? data.scope.split(' ') : CALENDAR_SCOPES;

    // Fila única: si ya había una credencial conectada, esta reserva la reemplaza. El
    // `calendarId` seleccionado vuelve a "primary": la cuenta cambió, así que un id de
    // calendario secundario de la cuenta anterior ya no significa nada.
    const existing = await this.prisma.bookingCalendarCredential.findFirst();
    if (existing) {
      await this.prisma.bookingCalendarCredential.update({
        where: { id: existing.id },
        data: {
          googleAccountEmail: profile.email,
          encryptedRefreshToken,
          scopes,
          connectedByUserId,
          calendarId: 'primary',
        },
      });
    } else {
      await this.prisma.bookingCalendarCredential.create({
        data: { googleAccountEmail: profile.email, encryptedRefreshToken, scopes, connectedByUserId },
      });
    }

    this.logger.log(`Booking calendar connected as ${profile.email}`);
  }

  async getStatus(): Promise<BookingCalendarStatus> {
    const credential = await this.prisma.bookingCalendarCredential.findFirst();
    return {
      connected: !!credential,
      googleAccountEmail: credential?.googleAccountEmail ?? null,
      calendarId: credential?.calendarId ?? null,
    };
  }

  /**
   * Calendarios visibles para la cuenta conectada (los propios y los compartidos que aceptó),
   * para que el admin elija en cuál se crean los eventos en vez de asumir siempre "primary".
   */
  async getCalendars(): Promise<BookingCalendarListItem[]> {
    const credential = await this.prisma.bookingCalendarCredential.findFirst();
    if (!credential) {
      throw new BadRequestException('No booking calendar connected yet.');
    }

    const calendar = await this.buildCalendarClient(credential.encryptedRefreshToken);
    const { data } = await calendar.calendarList.list({ minAccessRole: 'writer' });

    return (data.items ?? [])
      .filter((item) => !!item.id)
      .map((item) => ({
        id: item.id!,
        summary: item.summaryOverride ?? item.summary ?? item.id!,
        primary: !!item.primary,
      }));
  }

  async selectCalendar(calendarId: string): Promise<void> {
    const credential = await this.prisma.bookingCalendarCredential.findFirst();
    if (!credential) {
      throw new BadRequestException('No booking calendar connected yet.');
    }

    // Valida contra la lista real de Google: evita guardar un id que no existe o al que la
    // cuenta perdió acceso, lo que rompería silenciosamente cada booking futuro.
    const calendars = await this.getCalendars();
    if (!calendars.some((c) => c.id === calendarId)) {
      throw new NotFoundException('That calendar is not accessible from the connected account.');
    }

    await this.prisma.bookingCalendarCredential.update({
      where: { id: credential.id },
      data: { calendarId },
    });
  }

  async disconnect(): Promise<void> {
    await this.prisma.bookingCalendarCredential.deleteMany({});
  }

  private async buildCalendarClient(encryptedRefreshToken: string) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const refreshToken = await this.kms.decrypt(encryptedRefreshToken);

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  private getRedirectUri(): string {
    const customUrl = this.configService.get<string>('BOOKING_GOOGLE_CALLBACK_URL');
    if (customUrl) return customUrl;

    const baseApiUrl =
      this.configService.get<string>('DOMAIN_BASE_URL') ?? 'http://localhost:3000/api';
    return `${baseApiUrl}/booking/admin/callback`;
  }
}

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { google } from 'googleapis';
import { BookingOauthService } from './booking-oauth.service';
import { PrismaService } from '@/platform/database/prisma.service';
import { KmsService } from '@/automation/tools/core/kms.service';

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn() })),
    },
    calendar: jest.fn(),
  },
}));

describe('BookingOauthService', () => {
  let service: BookingOauthService;
  const calendarListList = jest.fn();

  const mockPrisma = {
    bookingCalendarCredential: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockKms = {
    decrypt: jest.fn().mockResolvedValue('plain-refresh-token'),
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      const map: Record<string, string> = {
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
      };
      return map[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockKms.decrypt.mockResolvedValue('plain-refresh-token');
    (google.calendar as jest.Mock).mockReturnValue({
      calendarList: { list: calendarListList },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingOauthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KmsService, useValue: mockKms },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<BookingOauthService>(BookingOauthService);
  });

  describe('getStatus', () => {
    it('includes the connected account calendarId', async () => {
      mockPrisma.bookingCalendarCredential.findFirst.mockResolvedValue({
        id: 'cred-1',
        googleAccountEmail: 'ventas@tesseract.dev',
        calendarId: 'equipo.ventas@group.calendar.google.com',
      });

      const status = await service.getStatus();

      expect(status).toEqual({
        connected: true,
        googleAccountEmail: 'ventas@tesseract.dev',
        calendarId: 'equipo.ventas@group.calendar.google.com',
      });
    });

    it('returns nulls when nothing is connected', async () => {
      mockPrisma.bookingCalendarCredential.findFirst.mockResolvedValue(null);

      const status = await service.getStatus();

      expect(status).toEqual({ connected: false, googleAccountEmail: null, calendarId: null });
    });
  });

  describe('getCalendars', () => {
    it('maps the Google calendarList response, preferring summaryOverride', async () => {
      mockPrisma.bookingCalendarCredential.findFirst.mockResolvedValue({
        id: 'cred-1',
        encryptedRefreshToken: 'encrypted',
      });
      calendarListList.mockResolvedValue({
        data: {
          items: [
            { id: 'primary', summary: 'ventas@tesseract.dev', primary: true },
            {
              id: 'equipo.ventas@group.calendar.google.com',
              summary: 'Equipo Ventas',
              summaryOverride: 'Agenda de ventas',
              primary: false,
            },
          ],
        },
      });

      const calendars = await service.getCalendars();

      expect(calendars).toEqual([
        { id: 'primary', summary: 'ventas@tesseract.dev', primary: true },
        { id: 'equipo.ventas@group.calendar.google.com', summary: 'Agenda de ventas', primary: false },
      ]);
      expect(calendarListList).toHaveBeenCalledWith({ minAccessRole: 'writer' });
    });

    it('throws when no calendar has been connected yet', async () => {
      mockPrisma.bookingCalendarCredential.findFirst.mockResolvedValue(null);

      await expect(service.getCalendars()).rejects.toThrow(BadRequestException);
    });
  });

  describe('selectCalendar', () => {
    it('persists the calendarId when it is in the connected account calendar list', async () => {
      mockPrisma.bookingCalendarCredential.findFirst.mockResolvedValue({
        id: 'cred-1',
        encryptedRefreshToken: 'encrypted',
      });
      calendarListList.mockResolvedValue({
        data: {
          items: [
            { id: 'primary', summary: 'ventas@tesseract.dev', primary: true },
            { id: 'equipo.ventas@group.calendar.google.com', summary: 'Equipo Ventas', primary: false },
          ],
        },
      });

      await service.selectCalendar('equipo.ventas@group.calendar.google.com');

      expect(mockPrisma.bookingCalendarCredential.update).toHaveBeenCalledWith({
        where: { id: 'cred-1' },
        data: { calendarId: 'equipo.ventas@group.calendar.google.com' },
      });
    });

    it('rejects a calendarId the connected account cannot see', async () => {
      mockPrisma.bookingCalendarCredential.findFirst.mockResolvedValue({
        id: 'cred-1',
        encryptedRefreshToken: 'encrypted',
      });
      calendarListList.mockResolvedValue({
        data: { items: [{ id: 'primary', summary: 'ventas@tesseract.dev', primary: true }] },
      });

      await expect(service.selectCalendar('not-shared-with-me@group.calendar.google.com')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.bookingCalendarCredential.update).not.toHaveBeenCalled();
    });

    it('throws when no calendar has been connected yet', async () => {
      mockPrisma.bookingCalendarCredential.findFirst.mockResolvedValue(null);

      await expect(service.selectCalendar('primary')).rejects.toThrow(BadRequestException);
    });
  });
});

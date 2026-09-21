import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { BookingCalendarService } from './booking-calendar.service';

const SA_EMAIL = 'tesseract-gateway@fractal-tesseract.iam.gserviceaccount.com';
const IMPERSONATED = 'agenda@fractalops.com.mx';
const SIGN_JWT_URL = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(SA_EMAIL)}:signJwt`;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const getCredentials = jest.fn();
const getAccessToken = jest.fn();

jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getCredentials: (...args: unknown[]) => getCredentials(...args),
    getClient: () => Promise.resolve({ getAccessToken: (...args: unknown[]) => getAccessToken(...args) }),
  })),
}));

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
});

const failure = (status: number, body: string) => ({
  ok: false,
  status,
  json: () => Promise.resolve(JSON.parse(body)),
  text: () => Promise.resolve(body),
});

describe('BookingCalendarService', () => {
  const fetchMock = jest.fn();

  /** Responde a la pareja signJwt + canje, que es el camino feliz de todas las pruebas. */
  const happyPath = (expiresIn = 3600) =>
    fetchMock.mockImplementation((url: string) => {
      if (url === SIGN_JWT_URL) return Promise.resolve(okJson({ signedJwt: 'signed.jwt.value' }));
      if (url === TOKEN_URL) {
        return Promise.resolve(okJson({ access_token: 'calendar-token', expires_in: expiresIn }));
      }
      return Promise.reject(new Error(`URL inesperada: ${url}`));
    });

  async function build(env: Record<string, string> = {}): Promise<BookingCalendarService> {
    const values: Record<string, string> = {
      BOOKING_IMPERSONATED_USER: IMPERSONATED,
      BOOKING_SERVICE_ACCOUNT_EMAIL: SA_EMAIL,
      ...env,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingCalendarService,
        {
          provide: ConfigService,
          useValue: { get: (key: string, fallback = '') => values[key] ?? fallback },
        },
      ],
    }).compile();

    return module.get<BookingCalendarService>(BookingCalendarService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    getAccessToken.mockResolvedValue({ token: 'adc-token' });
    getCredentials.mockResolvedValue({ client_email: SA_EMAIL });
    jest.useFakeTimers().setSystemTime(new Date('2026-01-05T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('configuración', () => {
    it('defaults the target calendar to "primary" and leaves the group unset', async () => {
      const service = await build();

      expect(service.calendarId).toBe('primary');
      expect(service.availabilityGroupEmail).toBeNull();
    });

    it('reads the target calendar and the support group from the environment', async () => {
      const service = await build({
        BOOKING_CALENDAR_ID: 'equipo@group.calendar.google.com',
        BOOKING_AVAILABILITY_GROUP_EMAIL: 'soporte@fractalops.com.mx',
      });

      expect(service.calendarId).toBe('equipo@group.calendar.google.com');
      expect(service.availabilityGroupEmail).toBe('soporte@fractalops.com.mx');
    });

    it('fails with 503 and names the missing variable, without touching the network', async () => {
      const service = await build({ BOOKING_IMPERSONATED_USER: '' });

      await expect(service.getClient()).rejects.toThrow(ServiceUnavailableException);
      await expect(service.getClient()).rejects.toThrow(/BOOKING_IMPERSONATED_USER/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('tells the developer about BOOKING_SERVICE_ACCOUNT_EMAIL when ADC exposes no client_email', async () => {
      getCredentials.mockResolvedValue({});
      const service = await build({ BOOKING_SERVICE_ACCOUNT_EMAIL: '' });

      await expect(service.getClient()).rejects.toThrow(/BOOKING_SERVICE_ACCOUNT_EMAIL/);
    });

    it('discovers the service account email from ADC when it is not configured', async () => {
      happyPath();
      const service = await build({ BOOKING_SERVICE_ACCOUNT_EMAIL: '' });

      await service.getClient();

      expect(getCredentials).toHaveBeenCalled();
      expect(fetchMock.mock.calls[0][0]).toBe(SIGN_JWT_URL);
    });
  });

  describe('delegación de dominio', () => {
    it('signs an assertion that impersonates the Workspace user', async () => {
      happyPath();
      const service = await build();

      await service.getClient();

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(SIGN_JWT_URL);
      expect(init.headers.Authorization).toBe('Bearer adc-token');

      // `payload` viaja serializado dentro del cuerpo, así que hay que deshacer dos capas.
      const claims = JSON.parse(JSON.parse(init.body).payload);
      expect(claims).toMatchObject({
        iss: SA_EMAIL,
        sub: IMPERSONATED,
        scope: 'https://www.googleapis.com/auth/calendar',
        aud: TOKEN_URL,
      });
      expect(claims.exp - claims.iat).toBe(3600);
    });

    it('exchanges the signed assertion for an access token', async () => {
      happyPath();
      const service = await build();

      await service.getClient();

      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe(TOKEN_URL);
      expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

      const body = new URLSearchParams(init.body);
      expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
      expect(body.get('assertion')).toBe('signed.jwt.value');
    });

    it('surfaces a signJwt 403 as 503 — the shape of a missing serviceAccountTokenCreator', async () => {
      fetchMock.mockResolvedValue(failure(403, '{"error":{"status":"PERMISSION_DENIED"}}'));
      const service = await build();

      await expect(service.getClient()).rejects.toThrow(ServiceUnavailableException);
    });

    it('surfaces an unauthorized_client from the token endpoint as 503', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url === SIGN_JWT_URL) return Promise.resolve(okJson({ signedJwt: 'signed.jwt.value' }));
        return Promise.resolve(failure(401, '{"error":"unauthorized_client"}'));
      });
      const service = await build();

      await expect(service.getClient()).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('caché del token', () => {
    it('reuses the access token across calls', async () => {
      happyPath();
      const service = await build();

      await service.getClient();
      await service.getClient();

      // Dos llamadas: firmar y canjear. Si no hubiera caché serían cuatro.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('mints a fresh token once the old one expired', async () => {
      happyPath(3600);
      const service = await build();

      await service.getClient();
      jest.setSystemTime(new Date('2026-01-05T13:30:00.000Z'));
      await service.getClient();

      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('collapses concurrent cold-start requests into a single mint', async () => {
      happyPath();
      const service = await build();

      await Promise.all([service.getClient(), service.getClient(), service.getClient()]);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not cache a failed mint', async () => {
      fetchMock.mockResolvedValueOnce(failure(403, '{}'));
      const service = await build();

      await expect(service.getClient()).rejects.toThrow(ServiceUnavailableException);

      happyPath();
      await expect(service.getClient()).resolves.toBeDefined();
    });
  });
});

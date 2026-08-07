import { Test, TestingModule } from '@nestjs/testing';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Secret, TOTP } from 'otpauth';
import { PrismaService } from '@/platform/database/prisma.service';
import { TwoFactorService } from './two-factor.service';
import { BackupCodeUtil } from './utils/backup-code.util';
import { TOTP_PERIOD } from './two-factor.constants';

describe('TwoFactorService', () => {
  let service: TwoFactorService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userBackupCode: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  };

  /** Genera el código que la app autenticadora mostraría en un momento dado. */
  const codeAt = (base32Secret: string, timestamp: number) =>
    new TOTP({ period: TOTP_PERIOD, secret: Secret.fromBase32(base32Secret) }).generate({
      timestamp,
    });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: WINSTON_MODULE_PROVIDER, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<TwoFactorService>(TwoFactorService);
    jest.clearAllMocks();
  });

  describe('generateSetup', () => {
    it('etiqueta el QR con el email y el emisor, no con el userId', () => {
      const { otpauthUrl, base32Secret } = service.generateSetup('ana@fractal.com');

      expect(otpauthUrl).toContain('otpauth://totp/');
      expect(decodeURIComponent(otpauthUrl)).toContain('Tesseract:ana@fractal.com');
      expect(otpauthUrl).toContain('issuer=Tesseract');
      // 20 bytes en base32: el mismo formato que emitía speakeasy
      expect(base32Secret).toHaveLength(32);
    });

    it('emite un secreto distinto en cada alta', () => {
      const a = service.generateSetup('ana@fractal.com').base32Secret;
      const b = service.generateSetup('ana@fractal.com').base32Secret;
      expect(a).not.toEqual(b);
    });
  });

  describe('verifyTotp', () => {
    const secret = new Secret({ size: 20 }).base32;

    it('acepta el código del paso en curso', () => {
      expect(service.verifyTotp(secret, codeAt(secret, Date.now()))).toBe(0);
    });

    it('tolera un paso de desfase de reloj a cada lado', () => {
      const now = Date.now();
      expect(service.verifyTotp(secret, codeAt(secret, now - TOTP_PERIOD * 1000))).toBe(-1);
      expect(service.verifyTotp(secret, codeAt(secret, now + TOTP_PERIOD * 1000))).toBe(1);
    });

    it('rechaza códigos fuera de la ventana', () => {
      const now = Date.now();
      expect(service.verifyTotp(secret, codeAt(secret, now - 2 * TOTP_PERIOD * 1000))).toBeNull();
      expect(service.verifyTotp(secret, codeAt(secret, now + 2 * TOTP_PERIOD * 1000))).toBeNull();
    });

    it('rechaza el código de otro secreto', () => {
      const otherSecret = new Secret({ size: 20 }).base32;
      expect(service.verifyTotp(secret, codeAt(otherSecret, Date.now()))).toBeNull();
    });

    it('rechaza entradas que no son 6 dígitos sin reventar', () => {
      for (const bad of ['', '12345', '1234567', 'abcdef', 'AAAAA-BBBBB']) {
        expect(service.verifyTotp(secret, bad)).toBeNull();
      }
    });

    it('devuelve null en vez de lanzar si el secreto guardado está corrupto', () => {
      expect(service.verifyTotp('esto-no-es-base32-!!!', '123456')).toBeNull();
    });
  });

  describe('verifySecondFactor con TOTP', () => {
    const secret = new Secret({ size: 20 }).base32;

    it('acepta un código válido y registra el paso consumido', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: secret,
        twoFactorLastUsedStep: null,
      });

      const result = await service.verifySecondFactor('u1', codeAt(secret, Date.now()));

      expect(result).toBe(true);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { twoFactorLastUsedStep: Math.floor(Date.now() / 1000 / TOTP_PERIOD) },
      });
    });

    it('rechaza reutilizar un código ya consumido dentro de su ventana', async () => {
      const currentStep = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: secret,
        twoFactorLastUsedStep: currentStep,
      });

      const result = await service.verifySecondFactor('u1', codeAt(secret, Date.now()));

      expect(result).toBe(false);
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('rechaza un código anterior al último consumido', async () => {
      const currentStep = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: secret,
        twoFactorLastUsedStep: currentStep,
      });

      const previous = codeAt(secret, Date.now() - TOTP_PERIOD * 1000);
      expect(await service.verifySecondFactor('u1', previous)).toBe(false);
    });

    it('rechaza si el usuario no tiene secreto', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ twoFactorSecret: null });
      expect(await service.verifySecondFactor('u1', '123456')).toBe(false);
    });

    it('rechaza un código vacío sin consultar la base de datos', async () => {
      expect(await service.verifySecondFactor('u1', '')).toBe(false);
      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('verifySecondFactor con código de respaldo', () => {
    it('gasta el código y no consulta el secreto TOTP', async () => {
      mockPrismaService.userBackupCode.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.userBackupCode.count.mockResolvedValue(9);

      const result = await service.verifySecondFactor('u1', 'H4K92-7RTQM');

      expect(result).toBe(true);
      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
      // La marca de uso va condicionada a usedAt: null, así que dos peticiones
      // simultáneas no pueden gastar el mismo código dos veces.
      expect(mockPrismaService.userBackupCode.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', codeHash: BackupCodeUtil.hash('H4K92-7RTQM'), usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('rechaza un código ya usado o inexistente', async () => {
      mockPrismaService.userBackupCode.updateMany.mockResolvedValue({ count: 0 });
      expect(await service.verifySecondFactor('u1', 'H4K92-7RTQM')).toBe(false);
    });

    it('acepta el código escrito en minúsculas, sin guion o con espacios', async () => {
      mockPrismaService.userBackupCode.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.userBackupCode.count.mockResolvedValue(9);

      const expectedHash = BackupCodeUtil.hash('H4K92-7RTQM');
      for (const variant of ['h4k92-7rtqm', 'H4K927RTQM', 'h4k92 7rtqm', 'H4k92-7rTqM']) {
        jest.clearAllMocks();
        mockPrismaService.userBackupCode.updateMany.mockResolvedValue({ count: 1 });
        mockPrismaService.userBackupCode.count.mockResolvedValue(9);

        expect(await service.verifySecondFactor('u1', variant)).toBe(true);
        expect(mockPrismaService.userBackupCode.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ codeHash: expectedHash }) }),
        );
      }
    });
  });

  describe('generateBackupCodes', () => {
    it('emite 10 códigos únicos y sustituye los anteriores en una transacción', async () => {
      mockPrismaService.$transaction.mockResolvedValue([]);

      const codes = await service.generateBackupCodes('u1');

      expect(codes).toHaveLength(10);
      expect(new Set(codes).size).toBe(10);
      expect(codes.every((c) => /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/.test(c))).toBe(true);
      // Borrado y alta van juntos: nunca se queda sin códigos a medias
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.userBackupCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
    });

    it('guarda solo hashes, nunca el código en claro', async () => {
      mockPrismaService.$transaction.mockResolvedValue([]);

      const codes = await service.generateBackupCodes('u1');

      const createArg = mockPrismaService.userBackupCode.createMany.mock.calls[0][0];
      const stored = createArg.data.map((row: { codeHash: string }) => row.codeHash);
      expect(stored).toEqual(codes.map((c) => BackupCodeUtil.hash(c)));
      for (const code of codes) {
        expect(stored).not.toContain(code);
      }
    });
  });

  describe('BackupCodeUtil', () => {
    it('no usa caracteres ambiguos (I, L, O, U)', () => {
      const codes = Array.from({ length: 200 }, () => BackupCodeUtil.generate());
      expect(codes.join('')).not.toMatch(/[ILOU]/);
    });

    it('distingue un código de respaldo de un TOTP por su forma', () => {
      expect(BackupCodeUtil.looksLikeBackupCode('H4K92-7RTQM')).toBe(true);
      expect(BackupCodeUtil.looksLikeBackupCode('123456')).toBe(false);
      expect(BackupCodeUtil.looksLikeBackupCode('')).toBe(false);
    });
  });
});

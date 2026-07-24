import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { Prisma } from '@tesseract/database';
import { WebhookDedupService } from './webhook-dedup.service';
import { PrismaService } from '../database/prisma.service';

const mockPrismaService = {
  processedWebhookEvent: {
    create: jest.fn(),
    delete: jest.fn(),
  },
};

/** Error de constraint único tal como lo lanza Prisma. */
const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('WebhookDedupService', () => {
  let service: WebhookDedupService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDedupService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<WebhookDedupService>(WebhookDedupService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.clearAllMocks();
  });

  describe('claim', () => {
    it('devuelve true la primera vez que se ve un evento', async () => {
      mockPrismaService.processedWebhookEvent.create.mockResolvedValue({});

      await expect(service.claim('stripe', 'evt_1', 'invoice.paid')).resolves.toBe(true);
      expect(mockPrismaService.processedWebhookEvent.create).toHaveBeenCalledWith({
        data: { provider: 'stripe', eventId: 'evt_1', eventType: 'invoice.paid' },
      });
    });

    it('devuelve false ante un duplicado en vez de propagar el P2002', async () => {
      mockPrismaService.processedWebhookEvent.create.mockRejectedValue(uniqueViolation());

      await expect(service.claim('stripe', 'evt_1')).resolves.toBe(false);
    });

    it('propaga errores que no sean de constraint único', async () => {
      // Si la base está caída no podemos afirmar que sea duplicado: hay que
      // dejar que el llamador responda 503 y el proveedor reintente.
      mockPrismaService.processedWebhookEvent.create.mockRejectedValue(
        new Error('connection refused'),
      );

      await expect(service.claim('stripe', 'evt_1')).rejects.toThrow('connection refused');
    });
  });

  describe('release', () => {
    it('borra el claim para permitir el reintento', async () => {
      mockPrismaService.processedWebhookEvent.delete.mockResolvedValue({});

      await service.release('stripe', 'evt_1');

      expect(mockPrismaService.processedWebhookEvent.delete).toHaveBeenCalledWith({
        where: { provider_eventId: { provider: 'stripe', eventId: 'evt_1' } },
      });
    });

    it('no lanza si el claim ya no existe', async () => {
      // release() corre dentro del catch del webhook: si truena, taparía el
      // error de procesamiento original.
      mockPrismaService.processedWebhookEvent.delete.mockRejectedValue(new Error('not found'));

      await expect(service.release('stripe', 'evt_1')).resolves.toBeUndefined();
    });
  });
});

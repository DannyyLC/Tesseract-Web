import { CfdiRetryService } from './cfdi-retry.service';

describe('CfdiRetryService', () => {
  let service: CfdiRetryService;

  const mockPrisma = { invoice: { findMany: jest.fn() } } as any;
  const mockCfdiService = { stampInvoice: jest.fn(), resumeStalledInvoice: jest.fn() } as any;
  const mockEmailService = { sendCfdiFailuresAlert: jest.fn() } as any;
  const mockFacturapi = { isEnabled: true } as any;
  const mockConfig = { get: jest.fn(() => 'alertas@ejemplo.com') } as any;
  const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFacturapi.isEnabled = true;
    service = new CfdiRetryService(
      mockPrisma,
      mockCfdiService,
      mockEmailService,
      mockFacturapi,
      mockConfig,
      mockLogger,
    );
  });

  describe('con la facturación deshabilitada', () => {
    it('no barre nada ni manda la alerta', async () => {
      // No basta con que `stampInvoice` salga sola: sin esta guarda el cron consultaría 50
      // facturas cada noche para no hacer nada con ellas, y el correo de alerta —que existe
      // para avisar de una avería real— se volvería ruido diario.
      mockFacturapi.isEnabled = false;

      const result = await service.retryPending();

      expect(result).toEqual({ attempted: 0, stamped: 0, failed: 0 });
      expect(mockPrisma.invoice.findMany).not.toHaveBeenCalled();
      expect(mockCfdiService.stampInvoice).not.toHaveBeenCalled();
      expect(mockEmailService.sendCfdiFailuresAlert).not.toHaveBeenCalled();
    });
  });

  describe('habilitada', () => {
    it('sigue barriendo con normalidad', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([{ id: 'inv-1', cfdiStatus: 'PENDING' }]);
      mockCfdiService.stampInvoice.mockResolvedValue({ status: 'stamped' });

      const result = await service.retryPending();

      expect(mockPrisma.invoice.findMany).toHaveBeenCalled();
      expect(result).toEqual({ attempted: 1, stamped: 1, failed: 0 });
    });
  });
});

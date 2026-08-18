import { CfdiErrorKind, CfdiStatus } from '@tesseract/database';
import { CfdiService } from './cfdi.service';

describe('CfdiService', () => {
  let service: CfdiService;

  const mockPrisma = {
    invoice: {
      updateMany: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  } as any;

  const mockFacturapi = {
    invoices: {
      create: jest.fn(),
      downloadXml: jest.fn(),
      downloadPdf: jest.fn(),
    },
  } as any;

  const mockStorage = { upload: jest.fn() } as any;
  const mockConfig = { get: jest.fn(() => 'test-bucket') } as any;
  const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as any;

  /** Factura mexicana con perfil fiscal validado, lista para timbrar. */
  const stampableInvoice = {
    id: 'inv-1',
    organizationId: 'org-1',
    total: { toNumber: () => 499 },
    periodStart: new Date('2026-08-01'),
    periodEnd: new Date('2026-09-01'),
    organization: {
      country: 'MX',
      fiscalProfile: {
        facturapiCustomerId: 'cus_facturapi_1',
        validatedAt: new Date(),
        cfdiUse: 'G03',
      },
    },
  };

  /** Imita el `Blob` que devuelve el SDK del PAC al descargar el XML o el PDF. */
  const blob = (content: string) => ({
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode(content).buffer),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CfdiService(mockPrisma, mockFacturapi, mockStorage, mockConfig, mockLogger);
  });

  describe('stampInvoice — reclamo de la fila', () => {
    it('no llama al PAC cuando otro proceso ya tiene la factura', async () => {
      // El compare-and-swap no encontró la fila en PENDING/FAILED: o ya está timbrada, o hay
      // un timbrado en curso. Llamar al PAC aquí emitiría un segundo CFDI para un solo pago.
      mockPrisma.invoice.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.stampInvoice('inv-1');

      expect(result.status).toBe('skipped');
      expect(mockFacturapi.invoices.create).not.toHaveBeenCalled();
    });

    it('solo acepta reclamar facturas en PENDING o FAILED', async () => {
      mockPrisma.invoice.updateMany.mockResolvedValue({ count: 0 });

      await service.stampInvoice('inv-1');

      expect(mockPrisma.invoice.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            cfdiStatus: { in: [CfdiStatus.PENDING, CfdiStatus.FAILED] },
          }),
        }),
      );
    });
  });

  describe('stampInvoice — timbrado correcto', () => {
    beforeEach(() => {
      mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.invoice.findUnique.mockResolvedValue(stampableInvoice);
      mockFacturapi.invoices.create.mockResolvedValue({
        id: 'facturapi-1',
        uuid: 'AAAA-BBBB-CCCC-DDDD',
        folio_number: 42,
      });
      mockFacturapi.invoices.downloadXml.mockResolvedValue(blob('<cfdi/>'));
      mockFacturapi.invoices.downloadPdf.mockResolvedValue(blob('%PDF'));
    });

    it('guarda el folio fiscal y las rutas de los archivos', async () => {
      const result = await service.stampInvoice('inv-1');

      expect(result.status).toBe('stamped');
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cfdiStatus: CfdiStatus.STAMPED,
            cfdiUuid: 'AAAA-BBBB-CCCC-DDDD',
            facturapiId: 'facturapi-1',
          }),
        }),
      );
    });

    it('manda el id local como clave de idempotencia', async () => {
      // Es lo que impide un CFDI duplicado si el proceso muere entre la llamada al PAC y el
      // guardado, y el cron retoma la factura una hora después.
      await service.stampInvoice('inv-1');

      expect(mockFacturapi.invoices.create).toHaveBeenCalledWith(
        expect.objectContaining({ idempotency_key: 'inv-1' }),
      );
    });

    it('sube el XML y el PDF al bucket', async () => {
      await service.stampInvoice('inv-1');

      expect(mockStorage.upload).toHaveBeenCalledWith(
        'test-bucket',
        expect.stringContaining('.xml'),
        expect.any(Buffer),
        'application/xml',
      );
      expect(mockStorage.upload).toHaveBeenCalledWith(
        'test-bucket',
        expect.stringContaining('.pdf'),
        expect.any(Buffer),
        'application/pdf',
      );
    });
  });

  describe('clasificación de errores', () => {
    beforeEach(() => {
      mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.invoice.findUnique.mockResolvedValue(stampableInvoice);
    });

    it('marca CLIENT_DATA cuando el PAC señala un campo del receptor', async () => {
      mockFacturapi.invoices.create.mockRejectedValue({
        status: 400,
        message: 'Validation error',
        errors: [{ path: 'customer.tax_id', message: 'El RFC no está en el padrón del SAT' }],
      });

      const result = await service.stampInvoice('inv-1');

      expect(result.errorKind).toBe(CfdiErrorKind.CLIENT_DATA);
    });

    it('marca INTERNAL cuando el PAC responde 5xx', async () => {
      mockFacturapi.invoices.create.mockRejectedValue({
        status: 503,
        message: 'Service unavailable',
      });

      const result = await service.stampInvoice('inv-1');

      expect(result.errorKind).toBe(CfdiErrorKind.INTERNAL);
    });

    it('marca INTERNAL cuando la llave del PAC es inválida', async () => {
      mockFacturapi.invoices.create.mockRejectedValue({ status: 401, message: 'Unauthorized' });

      const result = await service.stampInvoice('inv-1');

      expect(result.errorKind).toBe(CfdiErrorKind.INTERNAL);
    });

    it('ante un error sin pistas asume INTERNAL', async () => {
      // Equivocarse hacia INTERNAL solo cuesta una alerta que revisamos; equivocarse hacia
      // CLIENT_DATA le pide al cliente corregir unos datos que están bien, y nadie se entera.
      mockFacturapi.invoices.create.mockRejectedValue(new Error('socket hang up'));

      const result = await service.stampInvoice('inv-1');

      expect(result.errorKind).toBe(CfdiErrorKind.INTERNAL);
    });
  });

  describe('sin perfil fiscal', () => {
    it('falla como CLIENT_DATA sin llamar al PAC', async () => {
      mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.invoice.findUnique.mockResolvedValue({
        ...stampableInvoice,
        organization: { country: 'MX', fiscalProfile: null },
      });

      const result = await service.stampInvoice('inv-1');

      expect(result.status).toBe('failed');
      expect(result.errorKind).toBe(CfdiErrorKind.CLIENT_DATA);
      expect(mockFacturapi.invoices.create).not.toHaveBeenCalled();
    });

    it('no timbra si el perfil existe pero el SAT nunca lo validó', async () => {
      mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.invoice.findUnique.mockResolvedValue({
        ...stampableInvoice,
        organization: {
          country: 'MX',
          fiscalProfile: { facturapiCustomerId: 'cus_1', validatedAt: null, cfdiUse: 'G03' },
        },
      });

      const result = await service.stampInvoice('inv-1');

      expect(result.errorKind).toBe(CfdiErrorKind.CLIENT_DATA);
      expect(mockFacturapi.invoices.create).not.toHaveBeenCalled();
    });
  });
});

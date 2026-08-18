import { FiscalProfileService } from './fiscal-profile.service';
import {
  FiscalDataRejectedException,
  FiscalNotApplicableException,
} from '@/platform/common/exceptions';
import { UpsertFiscalProfileDto } from './dto/upsert-fiscal-profile.dto';

describe('FiscalProfileService', () => {
  let service: FiscalProfileService;

  const mockPrisma = {
    organization: { findUnique: jest.fn() },
    fiscalProfile: { findUnique: jest.fn(), upsert: jest.fn() },
  } as any;

  const mockFacturapi = {
    customers: {
      create: jest.fn(),
      update: jest.fn(),
      validateTaxInfo: jest.fn(),
    },
  } as any;

  const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

  const dto: UpsertFiscalProfileDto = {
    rfc: 'XAXX010101000',
    legalName: 'EMPRESA DEMO SA DE CV',
    zipCode: '06600',
    taxRegime: '601',
    cfdiUse: 'G03',
    email: 'facturas@empresa.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FiscalProfileService(mockPrisma, mockFacturapi, mockLogger);
  });

  it('rechaza organizaciones no mexicanas', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ country: 'US' });

    await expect(service.upsert('org-1', dto)).rejects.toBeInstanceOf(
      FiscalNotApplicableException,
    );
    expect(mockFacturapi.customers.create).not.toHaveBeenCalled();
  });

  it('rechaza organizaciones sin país (aún no contratan)', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ country: null });

    await expect(service.upsert('org-1', dto)).rejects.toBeInstanceOf(
      FiscalNotApplicableException,
    );
  });

  describe('validación contra el padrón del SAT', () => {
    beforeEach(() => {
      mockPrisma.organization.findUnique.mockResolvedValue({ country: 'MX' });
      mockPrisma.fiscalProfile.findUnique.mockResolvedValue(null);
      mockFacturapi.customers.create.mockResolvedValue({ id: 'cus_1' });
    });

    it('no guarda nada si el SAT rechaza los datos', async () => {
      // Un perfil guardado sin validar se vería correcto en el panel y volvería a fallar en
      // cada intento de timbrado, sin que el cliente entienda por qué.
      mockFacturapi.customers.validateTaxInfo.mockResolvedValue({
        is_valid: false,
        errors: [{ path: 'legal_name', message: 'No coincide con el padrón' }],
      });

      await expect(service.upsert('org-1', dto)).rejects.toBeInstanceOf(
        FiscalDataRejectedException,
      );
      expect(mockPrisma.fiscalProfile.upsert).not.toHaveBeenCalled();
    });

    it('guarda con validatedAt cuando el SAT acepta', async () => {
      mockFacturapi.customers.validateTaxInfo.mockResolvedValue({ is_valid: true, errors: [] });
      mockPrisma.fiscalProfile.upsert.mockResolvedValue({
        ...dto,
        validatedAt: new Date(),
      });

      const result = await service.upsert('org-1', dto);

      expect(result.validatedAt).not.toBeNull();
      expect(mockPrisma.fiscalProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ facturapiCustomerId: 'cus_1' }),
        }),
      );
    });
  });

  describe('sincronización con el PAC', () => {
    beforeEach(() => {
      mockPrisma.organization.findUnique.mockResolvedValue({ country: 'MX' });
      mockFacturapi.customers.validateTaxInfo.mockResolvedValue({ is_valid: true, errors: [] });
      mockPrisma.fiscalProfile.upsert.mockResolvedValue({ ...dto, validatedAt: new Date() });
    });

    it('actualiza el receptor existente en vez de crear otro', async () => {
      mockPrisma.fiscalProfile.findUnique.mockResolvedValue({ facturapiCustomerId: 'cus_old' });
      mockFacturapi.customers.update.mockResolvedValue({ id: 'cus_old' });

      await service.upsert('org-1', dto);

      expect(mockFacturapi.customers.update).toHaveBeenCalledWith('cus_old', expect.any(Object));
      expect(mockFacturapi.customers.create).not.toHaveBeenCalled();
    });

    it('crea uno nuevo si el receptor guardado ya no existe en el PAC', async () => {
      // Pasa al borrarlo desde el panel de Facturapi o al cambiar la llave entre sandbox y
      // producción. Dejar el perfil inservible sería peor que crear otro receptor.
      mockPrisma.fiscalProfile.findUnique.mockResolvedValue({ facturapiCustomerId: 'cus_gone' });
      mockFacturapi.customers.update.mockRejectedValue({ status: 404, message: 'Not found' });
      mockFacturapi.customers.create.mockResolvedValue({ id: 'cus_new' });

      await service.upsert('org-1', dto);

      expect(mockFacturapi.customers.create).toHaveBeenCalled();
    });
  });

  describe('isMexican', () => {
    it('es true solo para MX', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ country: 'MX' });
      await expect(service.isMexican('org-1')).resolves.toBe(true);

      mockPrisma.organization.findUnique.mockResolvedValue({ country: null });
      await expect(service.isMexican('org-1')).resolves.toBe(false);
    });
  });
});

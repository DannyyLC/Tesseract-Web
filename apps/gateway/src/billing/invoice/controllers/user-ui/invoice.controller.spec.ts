import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from '../../invoice.service';
import { CfdiService } from '../../cfdi.service';
import { FacturapiClient } from '../../facturapi.client';
import { PrismaService } from '@/platform/database/prisma.service';
import { CfdiDisabledException } from '@/platform/common/exceptions';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';

describe('InvoiceController', () => {
  let controller: InvoiceController;

  const mockInvoiceService = {
    getDashboardData: jest.fn(),
    getCfdiFile: jest.fn(),
  };

  const mockCfdiService = {
    stampInvoice: jest.fn(),
  };

  const mockPrismaService = {
    invoice: {
      findFirst: jest.fn(),
    },
  };

  const mockFacturapiClient = { isEnabled: true };

  const user = { organizationId: 'org-1' } as UserPayload;
  /** El controlador escribe la respuesta a mano; cuando rechaza, no debería tocarla. */
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFacturapiClient.isEnabled = true;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvoiceController],
      providers: [
        { provide: InvoiceService, useValue: mockInvoiceService },
        { provide: CfdiService, useValue: mockCfdiService },
        { provide: FacturapiClient, useValue: mockFacturapiClient },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get<InvoiceController>(InvoiceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('generateCfdi con la facturación deshabilitada', () => {
    it('rechaza sin llegar a la base ni al PAC', async () => {
      // La guarda va antes de buscar la factura: no queremos ni consultarla. Y sobre todo no
      // queremos llamar a `stampInvoice`, que apagada devuelve `skipped` y este endpoint
      // traduciría a un 200 de "CFDI generado" sobre una factura que nadie timbró.
      mockFacturapiClient.isEnabled = false;

      await expect(controller.generateCfdi(user, 'inv-1', res)).rejects.toBeInstanceOf(
        CfdiDisabledException,
      );

      expect(mockPrismaService.invoice.findFirst).not.toHaveBeenCalled();
      expect(mockCfdiService.stampInvoice).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});

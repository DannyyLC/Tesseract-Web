import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from '../../invoice.service';
import { CfdiService } from '../../cfdi.service';
import { PrismaService } from '@/platform/database/prisma.service';

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvoiceController],
      providers: [
        { provide: InvoiceService, useValue: mockInvoiceService },
        { provide: CfdiService, useValue: mockCfdiService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get<InvoiceController>(InvoiceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

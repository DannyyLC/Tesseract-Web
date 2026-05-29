import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from '../../invoice.service';

describe('InvoiceController', () => {
  let controller: InvoiceController;

  const mockInvoiceService = {
    getDashboardData: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvoiceController],
      providers: [{ provide: InvoiceService, useValue: mockInvoiceService }],
    }).compile();

    controller = module.get<InvoiceController>(InvoiceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

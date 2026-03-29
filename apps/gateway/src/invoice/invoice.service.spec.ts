import { InvoiceService } from './invoice.service';
import { CursorPaginatedResponseUtils } from '../common/responses/cursor-paginated-response';

describe('InvoiceService', () => {
  let service: InvoiceService;
  const mockBuild = jest.fn();

  // Spy CursorPaginatedResponseUtils.getInstance().build
  jest.spyOn(CursorPaginatedResponseUtils, 'getInstance').mockReturnValue({ build: mockBuild } as any);

  const mockPrismaService = {
    invoice: {
      findMany: jest.fn(),
    },
  } as any;

  const mockLogger = { error: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InvoiceService(mockPrismaService, mockLogger);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns paginated data when invoices are found and converts decimals', async () => {
    const rawInvoices = [
      {
        id: 'inv-1',
        invoiceNumber: '1001',
        type: 'INVOICE',
        status: 'PAID',
        periodStart: new Date(),
        periodEnd: new Date(),
        subtotal: { toNumber: () => 10 },
        overageAmount: { toNumber: () => 1 },
        tax: { toNumber: () => 0.5 },
        total: { toNumber: () => 11.5 },
        stripeHostedUrl: 'https://hosted.example',
        stripePdfUrl: 'https://pdf.example',
        paidAt: null,
        dueAt: null,
        createdAt: new Date(),
      },
    ];

    mockPrismaService.invoice.findMany.mockResolvedValue(rawInvoices);

    const paginated = { items: [{ id: 'inv-1', subtotal: 10, total: 11.5 }], nextCursor: null };
    mockBuild.mockResolvedValue(paginated);

    const res = await service.getDashboardData('org-1', null, 10, null);

    expect(mockPrismaService.invoice.findMany).toHaveBeenCalled();
    expect(mockBuild).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'inv-1', subtotal: 10, total: 11.5 }),
      ]),
      10,
      null,
    );
    expect(res).toEqual(paginated);
  });

  it('logs and returns null when prisma returns null', async () => {
    mockPrismaService.invoice.findMany.mockResolvedValue(null);
    const res = await service.getDashboardData('org-1');
    expect(mockLogger.error).toHaveBeenCalled();
    expect(res).toBeNull();
  });
});

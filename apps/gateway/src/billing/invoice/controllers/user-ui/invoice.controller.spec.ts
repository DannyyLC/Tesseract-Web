import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DEFAULT_PAGE_SIZE } from '@tesseract/types';
import request from 'supertest';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { PrismaService } from '@/platform/database/prisma.service';
import { CfdiService } from '../../cfdi.service';
import { FacturapiClient } from '../../facturapi.client';
import { InvoiceService } from '../../invoice.service';
import { InvoiceController } from './invoice.controller';

/**
 * El `pageSize` de la query tiene que llegar al servicio como **número**.
 *
 * Se prueba a través de HTTP y con el `ValidationPipe` global montado igual que en `main.ts`, porque
 * es la única forma de ver el defecto: llamar al método del controlador a mano le pasa un número y
 * los pipes nunca corren. Cuando el parámetro no declaraba `ParseIntPipe`, el valor llegaba como
 * `'10'` y el servicio hacía `take: pageSize + 1`, que sobre un texto concatena en vez de sumar:
 * pedía 101 filas en lugar de 11.
 */
describe('InvoiceController (HTTP)', () => {
  let app: INestApplication;

  const mockInvoiceService = { getDashboardData: jest.fn() };
  const mockCfdiService = {};
  const mockFacturapiClient = {};
  const mockPrismaService = {};

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [InvoiceController],
      providers: [
        { provide: InvoiceService, useValue: mockInvoiceService },
        { provide: CfdiService, useValue: mockCfdiService },
        { provide: FacturapiClient, useValue: mockFacturapiClient },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    })
      // La autenticación no es lo que se prueba aquí; el usuario lo inyecta el guard real.
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          context.switchToHttp().getRequest().user = { organizationId: 'org-1' };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    jest.clearAllMocks();
    mockInvoiceService.getDashboardData.mockResolvedValue({
      items: [],
      nextPageAvailable: false,
      nextCursor: null,
      prevCursor: null,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('convierte el pageSize de la query a número', async () => {
    await request(app.getHttpServer()).get('/invoice/dashboard?pageSize=25').expect(200);

    const [, , pageSize] = mockInvoiceService.getDashboardData.mock.calls[0];

    expect(pageSize).toBe(25);
    expect(typeof pageSize).toBe('number');
  });

  it('sin pageSize usa el tamaño de página estándar', async () => {
    await request(app.getHttpServer()).get('/invoice/dashboard').expect(200);

    const [, , pageSize] = mockInvoiceService.getDashboardData.mock.calls[0];

    expect(pageSize).toBe(DEFAULT_PAGE_SIZE);
  });
});

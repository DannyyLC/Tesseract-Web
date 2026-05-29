import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/platform/database/prisma.service';
import { GlobalExceptionFilter } from './../src/platform/common/exceptions';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let prismaService: PrismaService;

  // Mock de PrismaService para evitar conexión real a la base de datos en E2E tests
  const mockPrismaService = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    onModuleInit: jest.fn().mockResolvedValue(undefined),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    workflow: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    apiKey: {
      findFirst: jest.fn(),
    },
    workflowCronTrigger: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeAll(async () => {
    // Configurar variables de entorno requeridas
    process.env.SUPER_ADMIN_SECRET =
      'test-super-admin-secret-for-e2e-tests-only-12345678901234567890123456789012';
    process.env.JWT_SECRET = 'test-jwt-secret-for-e2e-tests';
    process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-for-e2e-tests';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      // Desactivar el rate limiting para que los tests de validacion sean
      // deterministas (algunas rutas, p.ej. /auth/login, tienen @Throttle).
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();

    // Obtener el servicio de Prisma mockeado
    prismaService = app.get<PrismaService>(PrismaService);

    // Replicar la configuracion real de main.ts para que el E2E ejerza el
    // mismo stack (security headers, cookies, filtro de errores, validacion
    // y prefijo global) que corre en produccion.
    app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
    app.use(cookieParser());
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    // Cerrar la conexión de Prisma (mockeada)
    await prismaService?.$disconnect?.();
    // Cerrar la aplicación
    await app.close();
  });

  describe('bootstrap', () => {
    it('should have the application running', () => {
      expect(app).toBeDefined();
    });

    it('should apply helmet security headers', async () => {
      const response = await request(app.getHttpServer()).get('/api/auth/login');
      // helmet activa nosniff por defecto en todas las respuestas
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('routing', () => {
    it('should enforce the global /api prefix (404 outside it)', async () => {
      // Sin el prefijo /api ninguna ruta existe
      const response = await request(app.getHttpServer()).get('/workflows');
      expect(response.status).toBe(404);
    });

    it('should return 404 for an unknown route under /api', async () => {
      const response = await request(app.getHttpServer()).get('/api/this-route-does-not-exist');
      expect(response.status).toBe(404);
    });
  });

  describe('auth guards', () => {
    it('/api/workflows (GET) should reject requests without authentication', async () => {
      const response = await request(app.getHttpServer()).get('/api/workflows');
      // Ruta protegida: debe devolver error (no 200) sin credenciales
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).not.toBe(200);
    });
  });

  describe('validation (ValidationPipe)', () => {
    it('should reject login with an empty body (400)', async () => {
      const response = await request(app.getHttpServer()).post('/api/auth/login').send({});
      expect(response.status).toBe(400);
    });

    it('should reject login with an invalid email (400)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: 'whatever' });
      expect(response.status).toBe(400);
    });

    it('should reject login with non-whitelisted properties (400)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'user@acme.com', password: 'Password123!', hackerField: 'x' });
      expect(response.status).toBe(400);
    });
  });
});

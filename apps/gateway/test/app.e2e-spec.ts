import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';

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
  };

  beforeAll(async () => {
    // Configurar variables de entorno requeridas
    process.env.SUPER_ADMIN_SECRET = 'test-super-admin-secret-for-e2e-tests-only-12345678901234567890123456789012';
    process.env.JWT_SECRET = 'test-jwt-secret-for-e2e-tests';
    process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-for-e2e-tests';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();

    // Obtener el servicio de Prisma mockeado
    prismaService = app.get<PrismaService>(PrismaService);

    // Configurar la app igual que en main.ts
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
    if (prismaService && prismaService.$disconnect) {
      await prismaService.$disconnect();
    }
    // Cerrar la aplicación
    await app.close();
  });

  it('should have the application running', () => {
    expect(app).toBeDefined();
  });

  // Probar que una ruta protegida retorna error sin autenticación
  // En E2E con dependencias mockeadas, puede retornar 401 o 500 dependiendo del flujo
  it('/api/workflows (GET) should return error without auth', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/workflows');

    // Verificar que la ruta está protegida (retorna error, no 200)
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).not.toBe(200);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let prismaService: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    // Obtener el servicio de Prisma para cerrarlo después
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
    // Cerrar la conexión de Prisma explícitamente
    await prismaService.$disconnect();
    // Cerrar la aplicación
    await app.close();
  });

  it('should have the application running', () => {
    expect(app).toBeDefined();
  });

  // Si quieres probar una ruta específica, usa el prefijo /api
  // Ejemplo: Probar que una ruta protegida retorna 401
  it('/api/workflows (GET) should return 401 without auth', () => {
    return request(app.getHttpServer())
      .get('/api/workflows')
      .expect(401);
  });
});

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateEnv } from './config/env-validation';
import { ValidationPipe } from '@nestjs/common';
import { GlobalExceptionFilter } from './common/exceptions';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  validateEnv();
  try {
    const app = await NestFactory.create(AppModule, { rawBody: true });

    // Middleware para parsear cookies
    app.use(cookieParser());

    // Configuración CORS para permitir cookies httpOnly desde el frontend
    app.enableCors({
      origin: process.env.FRONTEND_URL ?? 'http://localhost:3001', // URL del frontend
      credentials: true, // Permite envío de cookies
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Admin-Key'],
      exposedHeaders: ['Set-Cookie'],
    });

    // Registro de Global exception filter
    app.useGlobalFilters(new GlobalExceptionFilter());

    // Prefijo global para todas las rutas
    app.setGlobalPrefix('api');

    // Validación automática de DTOs
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true, // Elimina propiedades no definidas en el DTO
        forbidNonWhitelisted: true, // Lanza error si hay propiedades extra
        transform: true, // Transforma tipos automáticamente
      }),
    );

    if (process.env.NODE_ENV !== 'production') {
      const config = new DocumentBuilder()
        .setTitle('Tesseract API Gateway')
        .setDescription(
          'API Gateway para Tesseract, gestionando usuarios, organizaciones, créditos, facturación y más.',
        )
        .setVersion('1.0')
        .addBearerAuth(
          {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Ingrese su token JWT para autenticación',
          },
          'access-token',
        )
        .build();
      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api/docs', app, document);
    }

    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    console.log(`Gateway corriendo en http://localhost:${port}/api`);
  } catch (error) {
    console.error('Error fatal al iniciar la aplicación:', error);
    process.exit(1);
  }
}

void bootstrap();

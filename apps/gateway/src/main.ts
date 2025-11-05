import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { GlobalExceptionFilter } from './common/exceptions';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Registro de Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Prefijo global para todas las rutas
  app.setGlobalPrefix('api');

  // Validación automática de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,  // Elimina propiedades no definidas en el DTO
      forbidNonWhitelisted: true,  // Lanza error si hay propiedades extra
      transform: true,  // Transforma tipos automáticamente
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Gateway corriendo en http://localhost:${port}/api`);
}
bootstrap();
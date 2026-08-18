import { Module } from '@nestjs/common';
import { CloudStorageService } from './cloud-storage.service';

/**
 * Acceso a Google Cloud Storage.
 *
 * **No es `@Global` a propósito**, a diferencia de `DatabaseModule`. Prisma lo usa
 * literalmente todo el mundo; el almacenamiento de objetos lo usan unos pocos dominios
 * (facturas, y más adelante adjuntos y exportaciones). Que cada consumidor lo importe hace
 * visible quién escribe en el bucket, y evita que un grafo parcial —un test de módulo, por
 * ejemplo— arranque sin él y falle por un provider que "debería estar ahí".
 */
@Module({
  providers: [CloudStorageService],
  exports: [CloudStorageService],
})
export class CloudStorageModule {}

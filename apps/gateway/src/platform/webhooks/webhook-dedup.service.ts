import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@tesseract/database';
import { PrismaService } from '../database/prisma.service';

/** Código de Prisma para violación de constraint único. */
const UNIQUE_VIOLATION = 'P2002';

/**
 * Deduplicación de webhooks entrantes.
 *
 * Los proveedores reintentan ante cualquier respuesta no-2xx. Varios de nuestros
 * handlers son aditivos (`addCredits` suma al balance, `invoiceItems.create` cobra
 * al cliente), así que reprocesar un evento duplica créditos y cargos.
 *
 * El flujo es reclamar-procesar-liberar:
 *
 *   if (!(await dedup.claim(...))) return;  // duplicado, ya lo vimos
 *   try { ...procesar... }
 *   catch { await dedup.release(...); throw; }  // el reintento sí debe reprocesar
 */
@Injectable()
export class WebhookDedupService {
  private readonly logger = new Logger(WebhookDedupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reclama un evento para procesarlo.
   *
   * @returns `true` si el evento es nuevo y toca procesarlo, `false` si ya fue
   * reclamado — sea por una entrega previa o por otra instancia procesándolo
   * ahora mismo. El constraint único resuelve la carrera entre instancias.
   */
  async claim(provider: string, eventId: string, eventType?: string): Promise<boolean> {
    try {
      await this.prisma.processedWebhookEvent.create({
        data: { provider, eventId, eventType },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        this.logger.log(`Evento duplicado ${provider}/${eventId}, se omite`);
        return false;
      }
      throw error;
    }
  }

  /**
   * Libera un claim tras un fallo de procesamiento, para que el reintento del
   * proveedor pueda volver a intentarlo.
   *
   * No propaga errores: si la fila ya no está, el objetivo se cumplió igual, y
   * un fallo aquí no debe tapar el error de procesamiento que lo originó.
   */
  async release(provider: string, eventId: string): Promise<void> {
    try {
      await this.prisma.processedWebhookEvent.delete({
        where: { provider_eventId: { provider, eventId } },
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo liberar el claim de ${provider}/${eventId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

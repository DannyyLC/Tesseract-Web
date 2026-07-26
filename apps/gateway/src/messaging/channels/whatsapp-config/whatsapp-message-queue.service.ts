import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppInboundEvent } from './dto/whatsapp-inbound-event.dto';

/**
 * Silencio que hay que esperar antes de responder. La ventana es *deslizante*:
 * cada mensaje nuevo la reinicia, así que se responde cuando la persona deja de
 * escribir, no a los N segundos del primer mensaje.
 */
export const WHATSAPP_WINDOW_SECONDS = Number(process.env.WHATSAPP_WINDOW_SECONDS ?? 8);

/**
 * Tope total de espera. Sin él, alguien que escribe cada 7 segundos extendería la
 * ventana para siempre y el bot nunca contestaría. Al alcanzarlo se responde con lo
 * acumulado; lo que llegue después arma la siguiente ventana, así que no se pierde
 * nada — solo se parte la respuesta en dos.
 */
export const WHATSAPP_MAX_WINDOW_SECONDS = Number(
  process.env.WHATSAPP_MAX_WINDOW_SECONDS ?? 40,
);

export type BufferedMessage = {
  messageId: string;
  sendTime: string;
  /** Hora de llegada según nuestro reloj. La ventana se mide con esto, no con
   *  `sendTime`, que viene del proveedor y puede traer desfase. */
  bufferedAt: number;
  event: WhatsAppInboundEvent;
};

export type DrainedWindow = {
  messages: BufferedMessage[];
  /** Clave temporal que sostiene los mensajes hasta confirmar el procesamiento. */
  processingKey: string | null;
};

/**
 * Buffer compartido de mensajes entrantes de WhatsApp.
 *
 * Cuando alguien manda tres mensajes seguidos queremos responder una sola vez, con
 * los tres juntos, en lugar de ejecutar el agente tres veces. Este servicio guarda
 * los mensajes de la ventana en Redis para que cualquier instancia pueda leerlos.
 *
 * La *espera* de la ventana no vive aquí: la agenda Cloud Tasks con `scheduleTime`.
 * Antes se hacía con un lock (`SET NX EX 180`) y un poll de un segundo dentro del
 * proceso; si el dueño del lock se congelaba —cosa habitual en Cloud Run tras
 * responder la request— el lock quedaba tomado tres minutos y **todos los mensajes
 * de ese remitente se descartaban en silencio**.
 */
@Injectable()
export class WhatsappMessageQueueService {
  private readonly logger = new Logger(WhatsappMessageQueueService.name);
  private readonly redisUrl = process.env.REDIS_URL;
  /** Margen amplio: cubre el retraso de la ventana más los reintentos de la cola. */
  private readonly bufferTtlSeconds = 900;

  isConfigured(): boolean {
    return Boolean(this.redisUrl);
  }

  /** Agrega un mensaje a la ventana en curso. */
  async bufferMessage(
    organizationId: string,
    phoneNumber: string,
    userNumber: string,
    message: BufferedMessage,
  ): Promise<void> {
    if (!this.redisUrl) {
      throw new Error('REDIS_URL no está configurado');
    }

    const key = this.getConversationKey(organizationId, phoneNumber, userNumber);

    await this.redisCommand(['RPUSH', key, JSON.stringify(message)]);
    await this.redisCommand(['EXPIRE', key, String(this.bufferTtlSeconds)]);
  }

  /**
   * Hora de llegada del último mensaje en el buffer, sin consumirlo.
   *
   * Es lo que permite decidir si la persona sigue escribiendo: se mira la cola de
   * la lista con `LINDEX -1` en vez de drenarla, para poder reagendar sin haber
   * tocado nada. Devuelve `null` si no hay nada que procesar.
   */
  async peekLastBufferedAt(
    organizationId: string,
    phoneNumber: string,
    userNumber: string,
  ): Promise<number | null> {
    if (!this.redisUrl) {
      throw new Error('REDIS_URL no está configurado');
    }

    const key = this.getConversationKey(organizationId, phoneNumber, userNumber);
    const raw = await this.redisCommand(['LINDEX', key, '-1']);

    if (raw === null || raw === undefined) {
      return null;
    }

    const [message] = this.parseMessages([raw]);
    return typeof message?.bufferedAt === 'number' ? message.bufferedAt : null;
  }

  /**
   * Toma los mensajes de la ventana para procesarlos.
   *
   * En vez de leer y borrar, mueve la lista a una clave de trabajo con `RENAME`.
   * Así un reintento de Cloud Tasks vuelve a encontrar los mensajes (el `RENAME`
   * falla porque el origen ya no existe, pero la clave de trabajo sigue ahí), y a
   * la vez los mensajes que lleguen después arrancan una ventana limpia en lugar de
   * mezclarse con los que ya se están procesando.
   */
  async drainWindow(
    organizationId: string,
    phoneNumber: string,
    userNumber: string,
    windowId: string,
  ): Promise<DrainedWindow> {
    if (!this.redisUrl) {
      throw new Error('REDIS_URL no está configurado');
    }

    const key = this.getConversationKey(organizationId, phoneNumber, userNumber);
    const processingKey = `${key}:proc:${windowId}`;

    try {
      await this.redisCommand(['RENAME', key, processingKey]);
      await this.redisCommand(['EXPIRE', processingKey, String(this.bufferTtlSeconds)]);
    } catch (error) {
      // Esperado en dos casos benignos: un reintento (la clave de trabajo ya
      // existe) o una ventana que otro despacho ya vació.
      this.logger.debug(
        `RENAME de la ventana ${windowId} no aplicó: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const raw = await this.redisCommand(['LRANGE', processingKey, '0', '-1']);
    const messages = this.parseMessages(raw);

    return { messages, processingKey: messages.length > 0 ? processingKey : null };
  }

  /** Descarta la ventana una vez procesada. Solo se llama tras responder al usuario. */
  async commitWindow(processingKey: string): Promise<void> {
    if (!this.redisUrl) {
      return;
    }

    try {
      await this.redisCommand(['DEL', processingKey]);
    } catch (error) {
      // El TTL la recoge igual; no vale la pena tumbar una ejecución exitosa.
      this.logger.warn(
        `No se pudo limpiar la ventana ${processingKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Identificador de la ventana. Todos los mensajes que caen en el mismo tramo de
   * `WHATSAPP_WINDOW_SECONDS` comparten valor, así que generan el mismo nombre de
   * tarea y Cloud Tasks se queda solo con la primera. Eso reemplaza al lock.
   */
  buildWindowId(sendTimeMs: number = Date.now()): string {
    return String(Math.floor(sendTimeMs / 1000 / WHATSAPP_WINDOW_SECONDS));
  }

  private getConversationKey(
    organizationId: string,
    phoneNumber: string,
    userNumber: string,
  ): string {
    return `wa:inbox:${organizationId}:${phoneNumber}:${userNumber}`;
  }

  /**
   * Ejecuta un comando contra el REST de Upstash.
   *
   * Los argumentos van en el cuerpo, no en la URL: los mensajes serializados pasan
   * del kilobyte y como segmento de path chocarían con el límite de longitud.
   */
  private async redisCommand(command: string[]): Promise<unknown> {
    const { endpoint, token } = this.parseUpstashRestUrl();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Upstash falló (${command[0]}): ${response.status} ${body}`);
    }

    const data = (await response.json()) as { result?: unknown; error?: string };
    if (data.error) {
      throw new Error(`Upstash devolvió error (${command[0]}): ${data.error}`);
    }

    return data.result;
  }

  private parseUpstashRestUrl(): { endpoint: string; token: string } {
    if (!this.redisUrl) {
      throw new Error('REDIS_URL no está configurado');
    }

    const parsed = new URL(this.redisUrl);
    const token = decodeURIComponent(parsed.password || parsed.username || '');
    if (!token) {
      throw new Error('REDIS_URL debe incluir el token REST de Upstash en el user info');
    }

    if (parsed.protocol === 'https:') {
      return { endpoint: `${parsed.protocol}//${parsed.host}`, token };
    }

    if (parsed.protocol === 'redis:' || parsed.protocol === 'rediss:') {
      // Upstash suele entregar REDIS_URL como redis(s):// aunque el REST sea https.
      return { endpoint: `https://${parsed.hostname}`, token };
    }

    throw new Error('Protocolo de REDIS_URL no soportado. Usa https://, redis:// o rediss://');
  }

  private parseMessages(values: unknown): BufferedMessage[] {
    if (!Array.isArray(values)) {
      return [];
    }

    return values
      .map((value) => {
        try {
          const parsed = JSON.parse(String(value)) as BufferedMessage;
          return parsed?.event ? parsed : null;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is BufferedMessage => entry !== null);
  }
}

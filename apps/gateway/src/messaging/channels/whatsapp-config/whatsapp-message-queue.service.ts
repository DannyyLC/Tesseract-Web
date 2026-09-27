import { Injectable } from '@nestjs/common';
import {
  ChannelBufferedMessage,
  ChannelDrainedWindow,
  ChannelMessageQueueService,
} from '../shared/channel-message-queue.service';
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
export const WHATSAPP_MAX_WINDOW_SECONDS = Number(process.env.WHATSAPP_MAX_WINDOW_SECONDS ?? 40);

export type BufferedMessage = ChannelBufferedMessage<WhatsAppInboundEvent>;
export type DrainedWindow = ChannelDrainedWindow<WhatsAppInboundEvent>;

/**
 * Buffer de mensajes entrantes de WhatsApp.
 *
 * Toda la mecánica vive en {@link ChannelMessageQueueService}; aquí solo se fija el
 * namespace de las claves y el largo de la ventana de este canal.
 */
@Injectable()
export class WhatsappMessageQueueService extends ChannelMessageQueueService<WhatsAppInboundEvent> {
  protected readonly keyPrefix = 'wa';
  protected readonly windowSeconds = WHATSAPP_WINDOW_SECONDS;
}

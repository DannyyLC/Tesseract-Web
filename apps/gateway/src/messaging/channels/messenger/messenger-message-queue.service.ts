import { Injectable } from '@nestjs/common';
import {
  ChannelBufferedMessage,
  ChannelDrainedWindow,
  ChannelMessageQueueService,
} from '../shared/channel-message-queue.service';
import { MessengerInboundEvent } from './dto/messenger-inbound-event.dto';

/**
 * Silencio que hay que esperar antes de responder. La ventana es *deslizante*:
 * cada mensaje nuevo la reinicia, así que se responde cuando la persona deja de
 * escribir, no a los N segundos del primer mensaje.
 */
export const MESSENGER_WINDOW_SECONDS = Number(process.env.MESSENGER_WINDOW_SECONDS ?? 8);

/**
 * Tope total de espera. Sin él, alguien que escribe cada 7 segundos extendería la
 * ventana para siempre y el bot nunca contestaría. Al alcanzarlo se responde con lo
 * acumulado; lo que llegue después arma la siguiente ventana, así que no se pierde
 * nada — solo se parte la respuesta en dos.
 */
export const MESSENGER_MAX_WINDOW_SECONDS = Number(
  process.env.MESSENGER_MAX_WINDOW_SECONDS ?? 40,
);

export type BufferedMessage = ChannelBufferedMessage<MessengerInboundEvent>;
export type DrainedWindow = ChannelDrainedWindow<MessengerInboundEvent>;

/**
 * Buffer de mensajes entrantes de Messenger.
 *
 * Toda la mecánica vive en {@link ChannelMessageQueueService}; aquí solo se fija el
 * namespace de las claves y el largo de la ventana de este canal.
 */
@Injectable()
export class MessengerMessageQueueService extends ChannelMessageQueueService<MessengerInboundEvent> {
  protected readonly keyPrefix = 'ms';
  protected readonly windowSeconds = MESSENGER_WINDOW_SECONDS;
}

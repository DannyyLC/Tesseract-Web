import {
  Body,
  Controller,
  ForbiddenException,
  HttpStatus,
  Inject,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ConversationChannel, MessengerConnectionStatus, TriggerType } from '@tesseract/database';
import { Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  MediaPolicy,
  approximateAudioSeconds,
  maxAudioBytes,
} from '@/automation/media-processing/media-policy';
import {
  MediaProcessingService,
  ProcessedAttachment,
} from '@/automation/media-processing/media-processing.service';
import { WorkflowsService } from '@/automation/workflows/workflows.service';
import { ConversationsService } from '@/messaging/conversations/conversations.service';
import { CloudTasksOidcGuard } from '@/platform/tasks/cloud-tasks-oidc.guard';
import { CloudTasksService } from '@/platform/tasks/cloud-tasks.service';
import { JsonObject } from '@prisma/client/runtime/client';
import { MessengerInboundEvent } from '../../dto';
import { MessengerConfigService } from '../../messenger-config.service';
import {
  BufferedMessage,
  MESSENGER_MAX_WINDOW_SECONDS,
  MESSENGER_WINDOW_SECONDS,
  MessengerMessageQueueService,
} from '../../messenger-message-queue.service';
import { MESSENGER_TASK_PREFIX, MESSENGER_WORKER_PATH } from '../../messenger-worker.constants';

interface ProcessWindowBody {
  organizationId: string;
  /** Página de Facebook que recibió los mensajes. */
  pageId: string;
  /** PSID de quien escribe. */
  senderId: string;
  windowId: string;
  /** Epoch ms del primer mensaje de la ventana; sirve para aplicar el tope total. */
  windowStartedAt?: number;
  /** Cuántas veces se ha reagendado esta ventana porque la persona seguía escribiendo. */
  extension?: number;
}

/**
 * Procesamiento diferido de los mensajes de Messenger.
 *
 * Gemelo de `WhatsappWorkerController`: Cloud Tasks invoca este endpoint unos segundos
 * después de que llega el webhook, ya con toda la ráfaga del usuario acumulada. Corre
 * como una request normal de Cloud Run, así que tiene CPU asignada de principio a fin.
 *
 * Contrato de códigos de respuesta, que es lo que decide si Cloud Tasks reintenta:
 *
 * - **5xx** → fallo transitorio (base de datos, servicio de agents, STT). Reintentar.
 * - **2xx** → terminado, o fallo permanente que reintentar no arregla. No reintentar.
 */
@SkipThrottle()
@UseGuards(CloudTasksOidcGuard)
@Controller('messenger/internal')
export class MessengerWorkerController {
  constructor(
    private readonly messengerConfigService: MessengerConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly workflowsService: WorkflowsService,
    private readonly messengerMessageQueueService: MessengerMessageQueueService,
    private readonly mediaProcessingService: MediaProcessingService,
    private readonly conversationsService: ConversationsService,
    private readonly cloudTasks: CloudTasksService,
  ) {}

  @Post('process-window')
  async processWindow(@Body() body: ProcessWindowBody, @Res() res: Response) {
    const { organizationId, pageId, senderId, windowId } = body;
    const logContext = { organizationId, pageId, senderId, windowId };

    // Ventana deslizante: si el último mensaje es más reciente que el silencio
    // requerido, la persona sigue escribiendo. Se reagenda sin tocar el buffer para
    // responder una sola vez a toda la ráfaga, en lugar de partirla en respuestas
    // sueltas cada vez que se cruza una frontera de tiempo.
    const deferred = await this.deferIfStillTyping(body, logContext);
    if (deferred) {
      return res.status(HttpStatus.OK).send(deferred);
    }

    const drained = await this.messengerMessageQueueService.drainWindow(
      organizationId,
      pageId,
      senderId,
      windowId,
    );

    if (drained.messages.length === 0) {
      // Puede pasar sin que nada esté mal: un reintento posterior al éxito, o una
      // ventana que expiró. No hay nada que hacer y no hay que reintentar.
      this.logger.warn('Ventana de Messenger vacía, no hay nada que procesar', logContext);
      return res.status(HttpStatus.OK).send({ processed: false, reason: 'empty-window' });
    }

    try {
      const account = await this.messengerConfigService.getMessengerConfigByPageId(pageId);

      if (!account?.isActive) {
        this.logger.warn('Config de Messenger ausente o inactiva al procesar la ventana', logContext);
        await this.commit(drained.processingKey);
        return res.status(HttpStatus.OK).send({ processed: false, reason: 'inactive-config' });
      }

      if (!account.defaultWorkflowId) {
        this.logger.error('Falta defaultWorkflowId; no se puede responder', logContext);
        await this.commit(drained.processingKey);
        return res.status(HttpStatus.OK).send({ processed: false, reason: 'missing-config' });
      }

      const { mediaPolicy: policy, presenceIndicators } =
        await this.workflowsService.getChannelPolicy(organizationId, account.defaultWorkflowId);

      // El workflow puede apagar visto/escribiendo (`presenceIndicators`); ver el worker de
      // WhatsApp para el porqué.
      if (presenceIndicators) {
        // Marcar como leído cuanto antes: es la señal de vida que ve el usuario.
        await this.messengerConfigService.markSeenAndSendTypingIndicator(account, senderId);
      }

      if (account.connectionStatus !== MessengerConnectionStatus.CONNECTED) {
        await this.messengerConfigService.updateConnectionStatus(
          account.id,
          MessengerConnectionStatus.CONNECTED,
        );
      }

      const interpreted = await this.interpretMessages(
        organizationId,
        drained.messages,
        policy,
        logContext,
      );

      // Los avisos van primero y el texto se sigue procesando: si alguien manda una
      // imagen junto con su pregunta, se le dice que la imagen no se puede leer pero su
      // pregunta igual se contesta.
      for (const notice of interpreted.notices) {
        await this.messengerConfigService.sendTextMessage(account, senderId, notice);
      }

      if (!interpreted.aggregatedText.trim()) {
        if (interpreted.notices.length === 0) {
          // Red de seguridad: ningún camino conocido llega aquí sin haber avisado, pero
          // si aparece uno nuevo, el usuario recibe algo en vez de silencio.
          await this.messengerConfigService.sendTextMessage(
            account,
            senderId,
            policy.messages.unsupportedFormat,
          );
          this.logger.error('No se pudo extraer texto de la ventana', {
            ...logContext,
            mediaErrors: interpreted.mediaErrors,
          });
        }
        await this.commit(drained.processingKey);
        return res.status(HttpStatus.OK).send({ processed: false, reason: 'no-text' });
      }

      // Mismo criterio que en el worker de WhatsApp: la longitud sirve para seguir el
      // pipeline, el contenido del mensaje del cliente no se escribe en los logs.
      this.logger.info('Ventana de Messenger agregada', {
        ...logContext,
        messageCount: drained.messages.length,
        textLength: interpreted.aggregatedText.length,
      });

      const execution = await this.workflowsService.execute(
        organizationId,
        account.defaultWorkflowId,
        { message: interpreted.aggregatedText },
        {
          channel: ConversationChannel.MESSENGER,
          // Contexto del canal para resolver la conversación. El equivalente de
          // `whatsappData`, que viaja como parámetro propio por razones históricas.
          messengerData: interpreted.primaryEvent,
          // Ya procesados aquí: `execute()` no debe volver a transcribirlos.
          preProcessedAttachments: interpreted.attachments,
        },
        undefined,
        undefined,
        undefined,
        TriggerType.WEBHOOK,
      );

      const result = execution.result as any;
      const messages = result?.messages ?? [];
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
      const assistantContent = lastMessage?.role === 'assistant' ? lastMessage.content : null;

      // Responder ANTES de consultar la conversación: `findOne` lanza si el id viene
      // vacío o la conversación está borrada, y hacerlo primero tiraba al piso una
      // respuesta ya generada y ya cobrada al tenant.
      await this.messengerConfigService.sendTextMessage(
        account,
        senderId,
        assistantContent || 'Received your message, but no response generated, try again later.',
      );

      // A partir de aquí el usuario ya tiene su respuesta: la ventana se cierra pase
      // lo que pase, para que un reintento no vuelva a ejecutar el workflow.
      await this.commit(drained.processingKey);

      try {
        const conversation = await this.conversationsService.findOne(
          organizationId,
          result?.conversationId,
        );

        await this.messengerConfigService.handleActionsDerivatedFromMetadata(
          result?.conversationId,
          organizationId,
          conversation?.metadata as JsonObject,
          account,
          senderId,
          account.defaultWorkflowId,
        );
      } catch (metadataError) {
        this.logger.error('Fallaron las acciones derivadas de metadata', {
          ...logContext,
          conversationId: result?.conversationId,
          error: metadataError instanceof Error ? metadataError.message : String(metadataError),
          stack: metadataError instanceof Error ? metadataError.stack : undefined,
        });
      }

      return res.status(HttpStatus.OK).send({ processed: true });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        // Bloqueo de negocio (sin crédito o sin suscripción activa): reintentar no lo va a
        // arreglar, así que la ventana SÍ se confirma para que Cloud Tasks no insista para
        // siempre en algo que nunca va a pasar la guardia. Mismo criterio que el worker de
        // WhatsApp y que `WorkflowsTestWorkerController`.
        await this.commit(drained.processingKey);
        this.logger.warn('Ejecución bloqueada, ventana confirmada sin reintento', {
          ...logContext,
          reason: error.message,
        });
        return res.status(HttpStatus.OK).send({ processed: false, reason: 'blocked' });
      }

      // La ventana NO se confirma: sigue en Redis para que el reintento la retome.
      this.logger.error('Error procesando la ventana de Messenger', {
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ processed: false });
    }
  }

  /**
   * Decide si hay que esperar más antes de responder.
   *
   * Devuelve el cuerpo de respuesta si reagendó (y por tanto no hay que procesar
   * ahora), o `null` si toca procesar ya. Reagendar es barato: mira la cola del
   * buffer sin consumirla y crea otra tarea con el tiempo que falta.
   */
  private async deferIfStillTyping(
    body: ProcessWindowBody,
    logContext: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const { organizationId, pageId, senderId, windowId } = body;

    const lastBufferedAt = await this.messengerMessageQueueService.peekLastBufferedAt(
      organizationId,
      pageId,
      senderId,
    );

    if (lastBufferedAt === null) {
      return null; // Buffer vacío: que siga el flujo normal y lo reporte.
    }

    const now = Date.now();
    const windowStartedAt = body.windowStartedAt ?? lastBufferedAt;
    const silenceMs = now - lastBufferedAt;
    const totalWaitMs = now - windowStartedAt;

    const stillTyping = silenceMs < MESSENGER_WINDOW_SECONDS * 1000;
    const capReached = totalWaitMs >= MESSENGER_MAX_WINDOW_SECONDS * 1000;

    if (!stillTyping || capReached) {
      if (capReached && stillTyping) {
        // No se pierde nada: lo que llegue después arma la siguiente ventana.
        this.logger.info('Tope de ventana alcanzado, se responde con lo acumulado', {
          ...logContext,
          totalWaitMs,
        });
      }
      return null;
    }

    const extension = (body.extension ?? 0) + 1;
    const remainingMs = MESSENGER_WINDOW_SECONDS * 1000 - silenceMs;

    await this.cloudTasks.enqueue({
      path: MESSENGER_WORKER_PATH,
      // Al menos un segundo: agendar en el pasado inmediato dispara al instante y
      // desperdicia el reagendado.
      delaySeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      taskId: [
        MESSENGER_TASK_PREFIX,
        CloudTasksService.sanitizeIdPart(organizationId),
        CloudTasksService.sanitizeIdPart(pageId),
        CloudTasksService.sanitizeIdPart(senderId),
        windowId,
        `x${extension}`,
      ].join('-'),
      payload: { organizationId, pageId, senderId, windowId, windowStartedAt, extension },
    });

    this.logger.debug('La persona sigue escribiendo, se extiende la ventana', {
      ...logContext,
      extension,
      silenceMs,
    });

    return { processed: false, reason: 'still-typing', extension };
  }

  /**
   * Convierte los mensajes crudos de la ventana en un solo texto para el agente.
   *
   * La transcripción ocurre aquí, **una sola vez por audio**, y pasa por
   * `MediaProcessingService` para aprovechar su caché por `contentHash`. Ojo: Meta no
   * publica el hash del archivo y sus URLs del CDN vienen firmadas (distintas en cada
   * entrega), así que la caché solo acierta dentro de la misma entrega — a diferencia
   * de WhatsApp, donde el `sha256` sí permite reconocer un reenvío.
   *
   * Cada tipo se consulta contra la política del workflow antes de descargar nada, así
   * que un tipo apagado no cuesta ni un byte.
   */
  private async interpretMessages(
    organizationId: string,
    messages: BufferedMessage[],
    policy: MediaPolicy,
    logContext: Record<string, unknown>,
  ): Promise<{
    aggregatedText: string;
    primaryEvent: MessengerInboundEvent;
    attachments?: ProcessedAttachment[];
    notices: string[];
    mediaErrors: string[];
  }> {
    const parts: string[] = [];
    const mediaErrors: string[] = [];
    const attachments: ProcessedAttachment[] = [];
    // Set para no repetir el mismo aviso si mandan tres imágenes seguidas.
    const notices = new Set<string>();

    for (const buffered of messages) {
      const { messaging } = buffered.event;

      // Un botón o menú persistente llega como postback: el título es lo que el usuario
      // ve y toca, así que es lo más parecido a lo que "dijo".
      const postbackText = messaging.postback?.title ?? messaging.postback?.payload;
      if (postbackText) {
        parts.push(postbackText);
      }

      if (messaging.message?.text) {
        parts.push(messaging.message.text);
      }

      // A diferencia de WhatsApp, un mensaje de Messenger puede traer texto y varios
      // adjuntos a la vez, así que se recorren todos en lugar de mirar un solo `type`.
      for (const attachment of messaging.message?.attachments ?? []) {
        const url = attachment.payload?.url;

        switch (attachment.type) {
          case 'image':
            // Messenger no tiene caption: la imagen no aporta texto por sí sola. Cuando
            // se encienda el OCR, este es el punto donde entra.
            if (!policy.image.enabled) {
              notices.add(policy.messages.imageDisabled);
            }
            break;

          case 'video':
            notices.add(policy.messages.videoDisabled);
            this.logger.warn('Mensaje de video recibido, no soportado', {
              ...logContext,
              messageId: buffered.messageId,
            });
            break;

          case 'audio': {
            if (!policy.audio.enabled) {
              notices.add(policy.messages.audioDisabled);
              break;
            }

            if (!url) {
              notices.add(policy.messages.audioFailed);
              mediaErrors.push('Adjunto de audio sin URL');
              break;
            }

            const { attachments: processed } =
              await this.mediaProcessingService.processIncomingAttachments(organizationId, [
                {
                  type: 'AUDIO',
                  sourceUrl: url,
                  // Meta no manda el mime type del adjunto; sus notas de voz salen en
                  // MP4/AAC, que es lo que asume el STT si no se le dice otra cosa.
                  mimeType: 'audio/mp4',
                  maxBytes: maxAudioBytes(policy),
                },
              ]);

            const processedAudio = processed?.[0];

            if (processedAudio?.tooLarge) {
              notices.add(policy.messages.audioTooLong);
              this.logger.warn('Audio rechazado por exceder el límite', {
                ...logContext,
                messageId: buffered.messageId,
                sizeBytes: processedAudio.sizeBytes,
                // Aproximado: el webhook no trae la duración, se deriva del tamaño.
                approxSeconds: processedAudio.sizeBytes
                  ? approximateAudioSeconds(processedAudio.sizeBytes)
                  : undefined,
                maxSeconds: policy.audio.maxSeconds,
              });
              break;
            }

            if (!processedAudio?.processedText) {
              // Avisar aunque la ventana traiga texto además del audio: si no, el usuario
              // ve una respuesta y se queda pensando por qué ignoramos su nota de voz.
              notices.add(policy.messages.audioFailed);
              mediaErrors.push(processedAudio?.processingError ?? 'STT sin texto');
              this.logger.error('Falló la transcripción de un audio', {
                ...logContext,
                messageId: buffered.messageId,
                error: processedAudio?.processingError,
              });
              break;
            }

            parts.push(processedAudio.processedText);
            attachments.push(processedAudio);
            break;
          }

          default:
            // Archivos, ubicaciones, contactos compartidos y `fallback` (enlaces que
            // Meta no supo clasificar). Antes solo se registraba y el usuario no recibía
            // nada.
            notices.add(policy.messages.unsupportedFormat);
            this.logger.warn('Tipo de adjunto de Messenger no manejado', {
              ...logContext,
              messageId: buffered.messageId,
              type: attachment.type,
            });
        }
      }
    }

    return {
      aggregatedText: parts.map((part) => part.trim()).filter(Boolean).join('\n'),
      // El primer mensaje representa la ventana: es el que aporta el contexto de
      // remitente a `execute()`, igual que hacía el "dueño" de la ventana.
      primaryEvent: messages[0].event,
      attachments: attachments.length > 0 ? attachments : undefined,
      notices: [...notices],
      mediaErrors,
    };
  }

  private async commit(processingKey: string | null): Promise<void> {
    if (processingKey) {
      await this.messengerMessageQueueService.commitWindow(processingKey);
    }
  }
}

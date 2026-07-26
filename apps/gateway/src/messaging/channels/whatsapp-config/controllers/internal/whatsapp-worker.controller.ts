import { HttpService } from '@nestjs/axios';
import { Body, Controller, HttpStatus, Inject, Post, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ConversationChannel, TriggerType } from '@tesseract/database';
import { Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { firstValueFrom } from 'rxjs';
import { Logger } from 'winston';
import {
  MediaPolicy,
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
import { WhatsappConfigService } from '../../whatsapp-config.service';
import {
  BufferedMessage,
  WHATSAPP_MAX_WINDOW_SECONDS,
  WHATSAPP_WINDOW_SECONDS,
  WhatsappMessageQueueService,
} from '../../whatsapp-message-queue.service';
import { WhatsAppInboundEvent } from '../../dto';
import { WHATSAPP_WORKER_PATH } from '../../whatsapp-worker.constants';

interface ProcessWindowBody {
  organizationId: string;
  phoneNumber: string;
  userNumber: string;
  windowId: string;
  /** Epoch ms del primer mensaje de la ventana; sirve para aplicar el tope total. */
  windowStartedAt?: number;
  /** Cuántas veces se ha reagendado esta ventana porque la persona seguía escribiendo. */
  extension?: number;
}

/**
 * Procesamiento diferido de los mensajes de WhatsApp.
 *
 * Cloud Tasks invoca este endpoint unos segundos después de que llega el webhook,
 * ya con toda la ráfaga del usuario acumulada. Corre como una request normal de
 * Cloud Run, así que tiene CPU asignada de principio a fin — a diferencia del
 * esquema anterior, donde el trabajo seguía después del ACK y se congelaba.
 *
 * Contrato de códigos de respuesta, que es lo que decide si Cloud Tasks reintenta:
 *
 * - **5xx** → fallo transitorio (base de datos, servicio de agents, STT). Reintentar.
 * - **2xx** → terminado, o fallo permanente que reintentar no arregla. No reintentar.
 */
@SkipThrottle()
@UseGuards(CloudTasksOidcGuard)
@Controller('whatsapp-config/internal')
export class WhatsappWorkerController {
  constructor(
    private readonly httpService: HttpService,
    private readonly whatsappConfigService: WhatsappConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly workflowsService: WorkflowsService,
    private readonly whatsappMessageQueueService: WhatsappMessageQueueService,
    private readonly mediaProcessingService: MediaProcessingService,
    private readonly conversationsService: ConversationsService,
    private readonly cloudTasks: CloudTasksService,
  ) {}

  @Post('process-window')
  async processWindow(@Body() body: ProcessWindowBody, @Res() res: Response) {
    const { organizationId, phoneNumber, userNumber, windowId } = body;
    const logContext = { organizationId, phoneNumber, userNumber, windowId };

    // Ventana deslizante: si el último mensaje es más reciente que el silencio
    // requerido, la persona sigue escribiendo. Se reagenda sin tocar el buffer para
    // responder una sola vez a toda la ráfaga, en lugar de partirla en respuestas
    // sueltas cada vez que se cruza una frontera de tiempo.
    const deferred = await this.deferIfStillTyping(body, logContext);
    if (deferred) {
      return res.status(HttpStatus.OK).send(deferred);
    }

    const drained = await this.whatsappMessageQueueService.drainWindow(
      organizationId,
      phoneNumber,
      userNumber,
      windowId,
    );

    if (drained.messages.length === 0) {
      // Puede pasar sin que nada esté mal: un reintento posterior al éxito, o una
      // ventana que expiró. No hay nada que hacer y no hay que reintentar.
      this.logger.warn('Ventana de WhatsApp vacía, no hay nada que procesar', logContext);
      return res.status(HttpStatus.OK).send({ processed: false, reason: 'empty-window' });
    }

    try {
      const account = await this.whatsappConfigService.getWhatsappConfigByPhoneNumber(phoneNumber);

      if (!account?.isActive) {
        this.logger.warn('Config de WhatsApp ausente o inactiva al procesar la ventana', logContext);
        await this.commit(drained.processingKey);
        return res.status(HttpStatus.OK).send({ processed: false, reason: 'inactive-config' });
      }

      const yCloudApiKey = process.env.Y_CLOUD_API_KEY;
      if (!yCloudApiKey || !account.defaultWorkflowId) {
        this.logger.error('Falta Y_CLOUD_API_KEY o defaultWorkflowId; no se puede responder', {
          ...logContext,
          hasApiKey: Boolean(yCloudApiKey),
          defaultWorkflowId: account.defaultWorkflowId,
        });
        await this.commit(drained.processingKey);
        return res.status(HttpStatus.OK).send({ processed: false, reason: 'missing-config' });
      }

      // Marcar como leído cuanto antes: es la señal de vida que ve el usuario.
      await this.markMsgsAsReadAndSendTypingIndicator(
        yCloudApiKey,
        drained.messages.map((message) => message.messageId),
      );

      if (account.connectionStatus !== 'CONNECTED') {
        await this.whatsappConfigService.updateConnectionStatus(account.id, 'CONNECTED' as any);
      }

      if (account.phoneNumber == null || account.phoneNumber === '') {
        await this.whatsappConfigService.updatePhoneNumber(account.id, phoneNumber);
      }

      const policy = await this.workflowsService.getMediaPolicy(
        organizationId,
        account.defaultWorkflowId,
      );

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
        await this.whatsappConfigService.sendTextMessage(phoneNumber, userNumber, notice);
      }

      if (!interpreted.aggregatedText.trim()) {
        if (interpreted.notices.length === 0) {
          // Red de seguridad: ningún camino conocido llega aquí sin haber avisado, pero
          // si aparece uno nuevo, el usuario recibe algo en vez de silencio.
          await this.whatsappConfigService.sendTextMessage(
            phoneNumber,
            userNumber,
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

      this.logger.info('Ventana de WhatsApp agregada', {
        ...logContext,
        messageCount: drained.messages.length,
        text: interpreted.aggregatedText,
      });

      const execution = await this.workflowsService.execute(
        organizationId,
        account.defaultWorkflowId,
        { message: interpreted.aggregatedText },
        {
          channel: ConversationChannel.WHATSAPP,
          // Ya procesados aquí: `execute()` no debe volver a transcribirlos.
          preProcessedAttachments: interpreted.attachments,
        },
        undefined,
        interpreted.primaryEvent,
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
      await this.whatsappConfigService.sendTextMessage(
        phoneNumber,
        userNumber,
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

        await this.whatsappConfigService.handleActionsDerivatedFromMetadata(
          result?.conversationId,
          organizationId,
          conversation?.metadata as JsonObject,
          interpreted.primaryEvent,
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
      // La ventana NO se confirma: sigue en Redis para que el reintento la retome.
      this.logger.error('Error procesando la ventana de WhatsApp', {
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
    const { organizationId, phoneNumber, userNumber, windowId } = body;

    const lastBufferedAt = await this.whatsappMessageQueueService.peekLastBufferedAt(
      organizationId,
      phoneNumber,
      userNumber,
    );

    if (lastBufferedAt === null) {
      return null; // Buffer vacío: que siga el flujo normal y lo reporte.
    }

    const now = Date.now();
    const windowStartedAt = body.windowStartedAt ?? lastBufferedAt;
    const silenceMs = now - lastBufferedAt;
    const totalWaitMs = now - windowStartedAt;

    const stillTyping = silenceMs < WHATSAPP_WINDOW_SECONDS * 1000;
    const capReached = totalWaitMs >= WHATSAPP_MAX_WINDOW_SECONDS * 1000;

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
    const remainingMs = WHATSAPP_WINDOW_SECONDS * 1000 - silenceMs;

    await this.cloudTasks.enqueue({
      path: WHATSAPP_WORKER_PATH,
      // Al menos un segundo: agendar en el pasado inmediato dispara al instante y
      // desperdicia el reagendado.
      delaySeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      taskId: [
        'wa',
        CloudTasksService.sanitizeIdPart(organizationId),
        CloudTasksService.sanitizeIdPart(phoneNumber),
        CloudTasksService.sanitizeIdPart(userNumber),
        windowId,
        `x${extension}`,
      ].join('-'),
      payload: { organizationId, phoneNumber, userNumber, windowId, windowStartedAt, extension },
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
   * `MediaProcessingService` para aprovechar su caché por `contentHash`: si alguien
   * reenvía el mismo audio, el `sha256` coincide y no se vuelve a pagar. Los adjuntos
   * resultantes se le entregan ya resueltos a `execute()`, que antes los rearmaba desde
   * el link y los transcribía de nuevo.
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
    primaryEvent: WhatsAppInboundEvent;
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
      const inbound = buffered.event.whatsappInboundMessage;

      switch (inbound.type) {
        case 'text':
          if (inbound.text?.body) {
            parts.push(inbound.text.body);
          }
          break;

        case 'image':
          if (!policy.image.enabled) {
            notices.add(policy.messages.imageDisabled);
            break;
          }
          if (inbound.image?.caption) {
            parts.push(inbound.image.caption);
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

          const { attachments: processed } =
            await this.mediaProcessingService.processIncomingAttachments(organizationId, [
              {
                type: 'AUDIO',
                sourceUrl: inbound.audio?.link || '',
                mimeType: inbound.audio?.mime_type || 'audio/ogg',
                sha256: inbound.audio?.sha256,
                maxBytes: maxAudioBytes(policy),
              },
            ]);

          const attachment = processed?.[0];

          if (attachment?.tooLarge) {
            notices.add(policy.messages.audioTooLong);
            this.logger.warn('Audio rechazado por exceder el límite', {
              ...logContext,
              messageId: buffered.messageId,
              sizeBytes: attachment.sizeBytes,
              maxSeconds: policy.audio.maxSeconds,
            });
            break;
          }

          if (!attachment?.processedText) {
            // Avisar aunque la ventana traiga texto además del audio. Antes, si venían
            // juntos, se contestaba al texto y el audio moría en silencio: el usuario
            // veía una respuesta y se quedaba pensando por qué ignoramos su nota de voz.
            notices.add(policy.messages.audioFailed);
            mediaErrors.push(attachment?.processingError ?? 'STT sin texto');
            this.logger.error('Falló la transcripción de un audio', {
              ...logContext,
              messageId: buffered.messageId,
              error: attachment?.processingError,
            });
            break;
          }

          parts.push(attachment.processedText);
          attachments.push(attachment);
          break;
        }

        default:
          // Stickers, documentos, ubicaciones, contactos. Antes solo se registraba y el
          // usuario no recibía nada.
          notices.add(policy.messages.unsupportedFormat);
          this.logger.warn('Tipo de mensaje de WhatsApp no manejado', {
            ...logContext,
            messageId: buffered.messageId,
            type: inbound.type,
          });
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
      await this.whatsappMessageQueueService.commitWindow(processingKey);
    }
  }

  private async markMsgsAsReadAndSendTypingIndicator(
    accessToken: string,
    messageIds: string[],
  ): Promise<void> {
    const results = await Promise.allSettled(
      messageIds.map((messageId) =>
        firstValueFrom(
          this.httpService.post(
            `https://api.ycloud.com/v2/whatsapp/inboundMessages/${messageId}/typingIndicator`,
            {},
            { headers: { 'X-API-Key': accessToken, 'Content-Type': 'application/json' } },
          ),
        ),
      ),
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn(`No se pudo marcar como leído el mensaje ${messageIds[index]}`, {
          error: result.reason?.message,
        });
      }
    });
  }
}

import { HttpService } from '@nestjs/axios';
import { Body, Controller, HttpStatus, Inject, Post, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ConversationChannel, TriggerType } from '@tesseract/database';
import { Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { firstValueFrom } from 'rxjs';
import { Logger } from 'winston';
import { MediaType } from '@/automation/media-processing/adapters/media-processor.adapter';
import { OpenAiCompatibleMediaProcessorAdapter } from '@/automation/media-processing/adapters/openai-compatible-media-processor.adapter';
import { WorkflowsService } from '@/automation/workflows/workflows.service';
import { ConversationsService } from '@/messaging/conversations/conversations.service';
import { CloudTasksOidcGuard } from '@/platform/tasks/cloud-tasks-oidc.guard';
import { JsonObject } from '@prisma/client/runtime/client';
import { WhatsappConfigService } from '../../whatsapp-config.service';
import { BufferedMessage, WhatsappMessageQueueService } from '../../whatsapp-message-queue.service';
import { WhatsAppInboundEvent } from '../../dto';

interface ProcessWindowBody {
  organizationId: string;
  phoneNumber: string;
  userNumber: string;
  windowId: string;
}

/** Texto de un mensaje que no pudimos interpretar, para no dejar al usuario sin respuesta. */
const UNSUPPORTED_VIDEO_REPLY =
  'Los videos no son compatibles. Por favor envia texto, imagen o audio.';
const AUDIO_FAILED_REPLY =
  'No pude escuchar tu audio. ¿Me lo puedes mandar de nuevo o escribirlo?';

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
    private readonly mediaProcessor: OpenAiCompatibleMediaProcessorAdapter,
    private readonly conversationsService: ConversationsService,
  ) {}

  @Post('process-window')
  async processWindow(@Body() body: ProcessWindowBody, @Res() res: Response) {
    const { organizationId, phoneNumber, userNumber, windowId } = body;
    const logContext = { organizationId, phoneNumber, userNumber, windowId };

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

      const interpreted = await this.interpretMessages(drained.messages, logContext);

      if (interpreted.unsupportedVideo) {
        await this.whatsappConfigService.sendTextMessage(
          phoneNumber,
          userNumber,
          UNSUPPORTED_VIDEO_REPLY,
        );
        await this.commit(drained.processingKey);
        return res.status(HttpStatus.OK).send({ processed: true, reason: 'unsupported-video' });
      }

      if (!interpreted.aggregatedText.trim()) {
        // Antes esto era un `return` mudo y el usuario se quedaba esperando.
        await this.whatsappConfigService.sendTextMessage(
          phoneNumber,
          userNumber,
          AUDIO_FAILED_REPLY,
        );
        this.logger.error('No se pudo extraer texto de la ventana', {
          ...logContext,
          mediaErrors: interpreted.mediaErrors,
        });
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
        { channel: ConversationChannel.WHATSAPP },
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
   * Convierte los mensajes crudos de la ventana en un solo texto para el agente.
   *
   * La transcripción y el OCR ocurren aquí, una sola vez por mensaje. Antes el audio
   * se transcribía en el webhook y `execute()` lo volvía a transcribir al rearmar los
   * adjuntos, pagando dos veces por el mismo audio.
   */
  private async interpretMessages(
    messages: BufferedMessage[],
    logContext: Record<string, unknown>,
  ): Promise<{
    aggregatedText: string;
    primaryEvent: WhatsAppInboundEvent;
    unsupportedVideo: boolean;
    mediaErrors: string[];
  }> {
    const parts: string[] = [];
    const mediaErrors: string[] = [];
    let unsupportedVideo = false;

    for (const buffered of messages) {
      const inbound = buffered.event.whatsappInboundMessage;

      switch (inbound.type) {
        case 'text':
          if (inbound.text?.body) {
            parts.push(inbound.text.body);
          }
          break;

        case 'image':
          parts.push(inbound.image?.caption || 'Picture without caption');
          break;

        case 'audio': {
          const result = await this.mediaProcessor.process({
            type: 'AUDIO' as MediaType,
            sourceUrl: inbound.audio?.link || '',
            mimeType: inbound.audio?.mime_type || 'audio/ogg',
            sha256: inbound.audio?.sha256,
            metadata: {},
            customOcrPrompt: '',
          });

          if (result.status === 'FAILED' || !result.processedText) {
            mediaErrors.push(result.error ?? 'STT sin texto');
            this.logger.error('Falló la transcripción de un audio', {
              ...logContext,
              messageId: buffered.messageId,
              error: result.error,
            });
            break;
          }

          parts.push(result.processedText);
          break;
        }

        case 'video':
          unsupportedVideo = true;
          this.logger.warn('Mensaje de video recibido, no soportado', {
            ...logContext,
            messageId: buffered.messageId,
          });
          break;

        default:
          this.logger.warn('Tipo de mensaje de WhatsApp no manejado', {
            ...logContext,
            messageId: buffered.messageId,
            type: inbound.type,
          });
      }
    }

    return {
      aggregatedText: parts.map((part) => part.trim()).filter(Boolean).join('\n'),
      // El primer mensaje representa la ventana: es el que aporta los adjuntos y el
      // contexto de remitente a `execute()`, igual que hacía el "dueño" de la ventana.
      primaryEvent: messages[0].event,
      unsupportedVideo,
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

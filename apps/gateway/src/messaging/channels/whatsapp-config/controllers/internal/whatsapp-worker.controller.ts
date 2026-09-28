import {
  ProcessedAttachment
} from '@/automation/media-processing/media-processing.service';
import { WorkflowsService } from '@/automation/workflows/workflows.service';
import { ConversationsService } from '@/messaging/conversations/conversations.service';
import { maskPhone } from '@/platform/common/utils/mask-phone';
import { CloudTasksOidcGuard } from '@/platform/tasks/cloud-tasks-oidc.guard';
import { CloudTasksService } from '@/platform/tasks/cloud-tasks.service';
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
import { JsonObject } from '@prisma/client/runtime/client';
import { ConversationChannel, TriggerType, WhatsAppConfig } from '@tesseract/database';
import { Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { IWBPayloadConsumer } from '../../payload-consumers/wb-payload-consumer.interface';
import { WBPayloadConsumerResolver } from '../../payload-consumers/wb-payload-consumer.resolver';
import { isSupportedWhatsAppProvider } from '../../transporters/wb-transporter.interface';
import { WhatsappConfigService } from '../../whatsapp-config.service';
import {
  BufferedMessage,
  WHATSAPP_MAX_WINDOW_SECONDS,
  WHATSAPP_WINDOW_SECONDS,
  WhatsappMessageQueueService
} from '../../whatsapp-message-queue.service';
import { WHATSAPP_WORKER_PATH } from '../../whatsapp-worker.constants';

interface ProcessWindowBody {
  organizationId: string;
  agentPhoneNumber: string;
  clientPhoneNumber: string;
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
    private readonly whatsappConfigService: WhatsappConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly workflowsService: WorkflowsService,
    private readonly whatsappMessageQueueService: WhatsappMessageQueueService,
    private readonly conversationsService: ConversationsService,
    private readonly cloudTasks: CloudTasksService,
    private readonly payloadConsumerResolver: WBPayloadConsumerResolver,
  ) {}

  @Post('process-window')
  async processWindow(@Body() body: ProcessWindowBody, @Res() res: Response) {
    const { organizationId, agentPhoneNumber, clientPhoneNumber, windowId } = body;
    // `clientPhoneNumber` es el teléfono del cliente y se arrastra a todas las líneas de log de
    // este worker, así que se enmascara aquí una sola vez. `agentPhoneNumber` es el número del
    // tenant —no es dato personal de nadie— y se deja entero para poder identificar la
    // cuenta. El enmascarado es determinista: se puede seguir buscando en Cloud Logging.
    const logContext = { organizationId, agentPhoneNumber, clientPhoneNumber: maskPhone(clientPhoneNumber), windowId };

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
      agentPhoneNumber,
      clientPhoneNumber,
      windowId,
    );

    if (drained.messages.length === 0) {
      // Puede pasar sin que nada esté mal: un reintento posterior al éxito, o una
      // ventana que expiró. No hay nada que hacer y no hay que reintentar.
      this.logger.warn('Ventana de WhatsApp vacía, no hay nada que procesar', logContext);
      return res.status(HttpStatus.OK).send({ processed: false, reason: 'empty-window' });
    }

    try {
      const account = await this.whatsappConfigService.getWhatsappConfigByPhoneNumber(agentPhoneNumber);

      if (!account) {
        this.logger.warn('No Whatsapp-Config Account found for: ', logContext);
        await this.commit(drained.processingKey);
        return res.status(HttpStatus.OK).send({ processed: false, reason: 'ausent-config' });
      }

      if (!account.defaultWorkflowId) {
        this.logger.error('Falta defaultWorkflowId; no se puede responder', logContext);
        await this.commit(drained.processingKey);
        return res.status(HttpStatus.OK).send({ processed: false, reason: 'missing-config' });
      }

      // `account.provider` es un dato de la base, no algo que este flujo controle: un
      // proveedor no soportado (typo, migración a medias, un valor que se dio de baja)
      // es un problema de configuración permanente, no una falla transitoria. Cortar
      // aquí evita que `interpretMessages`/`markMessagesAsRead` lo descubran más
      // adelante y devuelvan 500 — un reintento de Cloud Tasks jamás lo arregla, así
      // que insistir solo quema cuota sin que el cliente reciba nunca una respuesta.
      if (!isSupportedWhatsAppProvider(account.provider)) {
        this.logger.error('Proveedor de WhatsApp no soportado; no se puede responder', {
          ...logContext,
          provider: account.provider,
        });
        await this.commit(drained.processingKey);
        return res.status(HttpStatus.OK).send({ processed: false, reason: 'unsupported-provider' });
      }

      // Si un humano ya tomó la conversación, el bot no emite nada en todo el turno: ni
      // respuesta, ni avisos de media, ni acuse de lectura. La palomita azul afirma que
      // alguien leyó el mensaje, y con el bot apagado nadie lo leyó.
      //
      // `execute()` vuelve a comprobar la bandera y sigue siendo la guardia autoritativa
      // —cubre que la prendan entre esta consulta y la ejecución—; esto solo evita los
      // efectos visibles que ocurren antes de llegar ahí.
      const conversation = await this.conversationsService.findActiveWhatsappConversation(
        account.id,
        clientPhoneNumber,
      );
      const isIntervened = conversation?.isHumanInTheLoop === true;

      if (!isIntervened) {
        // Marcar como leído cuanto antes: es la señal de vida que ve el usuario. Es
        // best-effort y va en su propio try/catch a propósito: es una cortesía visual,
        // no la respuesta en sí, y un fallo acá (transporter caído, credencial mala)
        // no debe tumbar el resto del turno ni impedir que el cliente reciba su
        // respuesta real.
        try {
          await this.whatsappConfigService.markMessagesAsRead(
            agentPhoneNumber,
            drained.messages.map((message) => message.messageId),
          );
        } catch (error) {
          this.logger.warn('No se pudo marcar la ventana como leída / mandar el typing indicator', {
            ...logContext,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (account.connectionStatus !== 'CONNECTED') {
        await this.whatsappConfigService.updateConnectionStatus(account.id, 'CONNECTED');
      }

      if (account.phoneNumber == null || account.phoneNumber === '') {
        await this.whatsappConfigService.updatePhoneNumber(account.id, agentPhoneNumber);
      }

      const policy = await this.workflowsService.getMediaPolicy(
        organizationId,
        account.defaultWorkflowId,
      );

      const interpreted = await this.interpretMessages(
        drained.messages,
        account
      );

      // Los avisos van primero y el texto se sigue procesando: si alguien manda una
      // imagen junto con su pregunta, se le dice que la imagen no se puede leer pero su
      // pregunta igual se contesta. Con la conversación intervenida no sale ninguno: son
      // texto del bot y el bot está apagado.
      if (!isIntervened) {
        for (const notice of interpreted.notices) {
          await this.whatsappConfigService.sendTextMessage(agentPhoneNumber, clientPhoneNumber, notice);
        }
      }

      if (!interpreted.aggregatedText.trim()) {
        if (interpreted.notices.length === 0) {
          // Red de seguridad: ningún camino conocido llega aquí sin haber avisado, pero
          // si aparece uno nuevo, el usuario recibe algo en vez de silencio. Salvo con la
          // conversación intervenida, donde el silencio es justamente lo correcto.
          if (!isIntervened) {
            await this.whatsappConfigService.sendTextMessage(
              agentPhoneNumber,
              clientPhoneNumber,
              policy.messages.unsupportedFormat,
            );
          }
          this.logger.error('No se pudo extraer texto de la ventana', {
            ...logContext,
            mediaErrors: interpreted.mediaErrors,
            isIntervened,
          });
        }
        await this.commit(drained.processingKey);
        return res.status(HttpStatus.OK).send({ processed: false, reason: 'no-text' });
      }

      // El texto agregado es el mensaje literal del cliente y no se loguea: Cloud Logging
      // lo retiene 30 días y lo lee cualquiera con Logs Viewer. La longitud basta para
      // seguir el pipeline (ventana vacía, ráfaga larga, media sin transcribir); el
      // contenido se consulta en la conversación, que es donde ya está guardado.
      this.logger.info('Ventana de WhatsApp agregada', {
        ...logContext,
        messageCount: drained.messages.length,
        textLength: interpreted.aggregatedText.length,
      });

      const execution = await this.workflowsService.execute(
        organizationId,
        account.defaultWorkflowId,
        { message: interpreted.aggregatedText },
        {
          channel: ConversationChannel.WHATSAPP,
          // Ya procesados aquí: `execute()` no debe volver a transcribirlos.
          whatsAppConfigId: account.id,
          preProcessedAttachments: interpreted.attachments,
        },
        undefined,
        interpreted.payloadConsumer,
        undefined,
        TriggerType.WEBHOOK,
      );

      const result = execution.result as any;
      const messages = result?.messages ?? [];
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
      const assistantContent = lastMessage?.role === 'assistant' ? lastMessage.content : null;

      if (!assistantContent) {
        // Sin texto del asistente no hay nada legítimo que decir, así que no se manda nada.
        // Antes salía una disculpa inventada en inglés que no existe en las traducciones, y
        // como la rama HITL de `execute()` devuelve la ejecución sin mensajes, el cliente la
        // recibía cada vez que escribía mientras un humano atendía la conversación.
        const skipped = result?.skipped;
        const detail = {
          ...logContext,
          executionId: execution.id,
          conversationId: result?.conversationId,
        };

        if (skipped === 'hitl') {
          this.logger.info('Conversación intervenida por un humano: el bot no responde', detail);
        } else {
          // Nadie apagó al bot y aun así no hay respuesta: eso sí es una anomalía.
          this.logger.error('Ejecución sin mensaje del asistente; no se envía nada', detail);
        }

        await this.commit(drained.processingKey);
        return res
          .status(HttpStatus.OK)
          .send({ processed: false, reason: skipped === 'hitl' ? 'hitl' : 'no-assistant-message' });
      }

      // Responder ANTES de consultar la conversación: `findOne` lanza si el id viene
      // vacío o la conversación está borrada, y hacerlo primero tiraba al piso una
      // respuesta ya generada y ya cobrada al tenant.
      await this.whatsappConfigService.sendTextMessage(agentPhoneNumber, clientPhoneNumber, assistantContent);

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
          interpreted.payloadConsumer,
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
        // arreglar, así que la ventana SÍ se confirma —igual que un `no-text`— para que Cloud
        // Tasks no insista para siempre en algo que nunca va a pasar la guardia. Mismo criterio
        // que `WorkflowsTestWorkerController`.
        await this.commit(drained.processingKey);
        this.logger.warn('Ejecución bloqueada, ventana confirmada sin reintento', {
          ...logContext,
          reason: error.message,
        });
        return res.status(HttpStatus.OK).send({ processed: false, reason: 'blocked' });
      }

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
    const { organizationId, agentPhoneNumber, clientPhoneNumber, windowId } = body;

    const lastBufferedAt = await this.whatsappMessageQueueService.peekLastBufferedAt(
      organizationId,
      agentPhoneNumber,
      clientPhoneNumber,
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
        CloudTasksService.sanitizeIdPart(agentPhoneNumber),
        CloudTasksService.sanitizeIdPart(clientPhoneNumber),
        windowId,
        `x${extension}`,
      ].join('-'),
      payload: { organizationId, agentPhoneNumber, clientPhoneNumber, windowId, windowStartedAt, extension },
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
    messages: BufferedMessage[],
    account: WhatsAppConfig
  ): Promise<{
    aggregatedText: string;
    payloadConsumer: IWBPayloadConsumer;
    attachments?: ProcessedAttachment[];
    notices: string[];
    mediaErrors: string[];
  }> {
    const parts: string[] = [];
    const mediaErrors: string[] = [];
    const attachments: ProcessedAttachment[] = [];
    // Set para no repetir el mismo aviso si mandan tres imágenes seguidas.
    const notices = new Set<string>();
    // El primer mensaje representa la ventana: es el que aporta el contexto de
    // remitente a `execute()`, igual que hacía el "dueño" de la ventana.
    let ownerPayloadConsumer: IWBPayloadConsumer | undefined;

    for (const buffered of messages) {
      // Cada mensaje de la ráfaga trae su propio payload y necesita su propio consumer:
      // uno solo, construido con el evento del primer mensaje, devolvería siempre la
      // misma interpretación sin importar cuántos mensajes tenga la ventana. La política
      // de cada tipo vive en el consumer del proveedor; aquí solo se agrega el resultado
      // de cada mensaje.
      const payloadConsumer = await this.payloadConsumerResolver.forProvider(
        account.provider,
        buffered.event,
      );
      if (!ownerPayloadConsumer) ownerPayloadConsumer = payloadConsumer;

      const interpreted = await payloadConsumer.getInterpretedMessage();

      if (interpreted.text) parts.push(interpreted.text);
      if (interpreted.attachment) attachments.push(interpreted.attachment);
      if (interpreted.notice) notices.add(interpreted.notice);
      if (interpreted.mediaError) mediaErrors.push(interpreted.mediaError);
    }

    return {
      aggregatedText: parts.map((part) => part.trim()).filter(Boolean).join('\n'),
      // `messages` nunca está vacío al llegar aquí (el caller ya cortó ese caso), así
      // que siempre queda asignado en la primera vuelta del for.
      payloadConsumer: ownerPayloadConsumer as IWBPayloadConsumer,
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
}

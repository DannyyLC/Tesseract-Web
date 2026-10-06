import { MediaProcessingService } from '@/automation/media-processing/media-processing.service';
import { WorkflowsService } from '@/automation/workflows/workflows.service';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { EndUsersService } from '@/identity/end-users/end-users.service';
import {
  ConversationsService,
  OutsideWorkflowReason,
} from '@/messaging/conversations/conversations.service';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { maskPhone } from '@/platform/common/utils/mask-phone';
import { CloudTasksService } from '@/platform/tasks/cloud-tasks.service';
import { WebhookDedupService } from '@/platform/webhooks/webhook-dedup.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ChatRole, WhatsAppConfig, WhatsAppTemplate } from '@tesseract/database';
import * as crypto from 'crypto';
import {
  CreateConfigDto,
  CreateTemplateDto,
  SendTemplateDto,
  UpdateTemplateDto,
  UpdateWhatsappConfigDto
} from '../../dto';
import { IWBPayloadConsumer, WBEventTypes } from '../../payload-consumers/wb-payload-consumer.interface';
import { WBPayloadConsumerResolver } from '../../payload-consumers/wb-payload-consumer.resolver';
import { splitMetaWebhook } from '../../payload-consumers/split-meta-webhook';
import { PublicWhatsAppConfig, toPublicConfig } from '../../whatsapp-config.presenter';
import { ApiResponse, ApiResponseBuilder, UserRole } from '@tesseract/types';
import { Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { WhatsappConfigService } from '../../whatsapp-config.service';
import {
  WHATSAPP_WINDOW_SECONDS,
  WhatsAppBufferedEvent,
  WhatsappMessageQueueService,
} from '../../whatsapp-message-queue.service';
import { WEBHOOK_PROVIDER_META_WHATSAPP, WEBHOOK_PROVIDER_YCLOUD, WHATSAPP_WORKER_PATH } from '../../whatsapp-worker.constants';

/** El mensaje del webhook que se está procesando: lo que el catch necesita para liberar y loguear. */
interface WebhookMessageContext {
  whatsappMessageId?: string;
  agentPhoneNumber?: string;
  clientPhoneNumber?: string;
}

@Controller('whatsapp-config')
export class WhatsappConfigController {
  constructor(
    private readonly whatsappConfigService: WhatsappConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly whatsappMessageQueueService: WhatsappMessageQueueService,
    private readonly cloudTasks: CloudTasksService,
    private readonly webhookDedup: WebhookDedupService,
    private readonly workflowsService: WorkflowsService,
    private readonly conversationsService: ConversationsService,
    private readonly endUsersService: EndUsersService,
    private readonly payloadConsumerResolver: WBPayloadConsumerResolver,
    private readonly mediaProcessingService: MediaProcessingService,
  ) {}

  // ─── Webhook ──────────────────────────────────────────────────────────

  /**
   * Handshake de suscripción del webhook de la Cloud API de Meta. Al registrar la URL, Meta
   * manda un GET con `hub.mode=subscribe`, el `hub.verify_token` que se configuró en su panel
   * y un `hub.challenge`; hay que devolver ese challenge tal cual, en texto plano, si el token
   * coincide con `META_WHATSAPP_VERIFY_TOKEN`. Sin coincidencia, 403.
   *
   * Es público por diseño (Meta no manda credenciales); solo devuelve el challenge que el
   * propio llamador envió, así que no expone nada. YCloud no usa este endpoint.
   */
  @SkipThrottle()
  @Get('whatsapp-webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const expected = process.env.META_WHATSAPP_VERIFY_TOKEN ?? '';
    if (!expected) {
      this.logger.error('META_WHATSAPP_VERIFY_TOKEN no está configurado');
      return res.sendStatus(HttpStatus.FORBIDDEN);
    }

    const received = Buffer.from(String(verifyToken ?? ''), 'utf8');
    const wanted = Buffer.from(expected, 'utf8');
    const tokenMatches = received.length === wanted.length && crypto.timingSafeEqual(received, wanted);

    if (mode !== 'subscribe' || !tokenMatches || !challenge) {
      return res.sendStatus(HttpStatus.FORBIDDEN);
    }
    return res.status(HttpStatus.OK).type('text/plain').send(String(challenge));
  }

  /**
   * Webhook de mensajes entrantes de YCloud.
   *
   * Este handler solo acusa recibo: verifica firma, deduplica, guarda el mensaje en
   * la ventana de agregación y encola una tarea. Todo dentro del ciclo de la
   * request, en decenas de milisegundos.
   *
   * El trabajo pesado (transcripción, OCR, ejecución del workflow, respuesta) vive
   * en `WhatsappWorkerController`. Antes ocurría aquí mismo, después del ACK: Cloud
   * Run estrangula la CPU en cuanto la respuesta sale, así que ese trabajo se
   * congelaba, y si la instancia se reciclaba el mensaje desaparecía sin dejar ni un
   * log. Ahora lo despacha Cloud Tasks como una request normal, con reintentos.
   *
   * Antes se verificaba la firma después de consultar y MUTAR la base
   * (`updateConnectionStatus`), lo que permitía a un llamador sin credenciales
   * cambiar el estado de conexión de una cuenta.
   *
   * El ThrottlerGuard global (20 req/60s por IP) no aplica: todas las entregas de
   * YCloud salen de un puñado de IPs suyas, así que comparten un solo bucket y una
   * ráfaga normal de mensajes se llevaba 429. Lo que protege este endpoint es la
   * firma HMAC y la deduplicación, no un límite por IP.
   */
  @SkipThrottle()
  @Post('whatsapp-webhook')
  async handleWebhook(@Body() body: any, @Res() res: Response, @Headers() headers: any) {
    // Declaradas afuera del try para que el catch (que cubre TODO el método, no solo el
    // procesamiento posterior a la firma) pueda usarlas en el log y en el release del
    // claim de deduplicación sin importar en qué punto haya fallado. `current` lo va
    // llenando `enqueueMessage` con el mensaje que se está procesando.
    let provider: string | undefined;
    const current: WebhookMessageContext = {};

    try {
      if (headers['ycloud-signature']) {
        provider = WEBHOOK_PROVIDER_YCLOUD;
      } else {
        provider = WEBHOOK_PROVIDER_META_WHATSAPP;
      }
      const webhookConsumer = await this.payloadConsumerResolver.forProvider(provider, body);

      // 1. Firma primero, sobre el webhook COMPLETO, antes de tocar la base de datos y antes
      // de decidir NADA sobre el payload — incluido si el evento es de un tipo que ni
      // siquiera vamos a procesar. Antes, un evento clasificado como NotAllowed contestaba
      // 200 sin haber validado la firma: un payload sin autenticar llegaba a parsearse y
      // clasificarse igual que uno legítimo.
      //
      // Lo correcto es firmar sobre el body crudo; el código anterior usaba
      // JSON.stringify(body), que solo funciona si la re-serialización coincide
      // byte a byte con lo que envió YCloud. Se intenta el raw body y, si no
      // valida, se cae al comportamiento viejo para no romper producción.
      // TODO(webhook-firma): revisar los logs de `signatureSource` unos días y,
      // si nunca aparece 'json-stringify', eliminar el fallback.
      const rawBody = (res.req as unknown as { rawBody?: Buffer }).rawBody;
      let isValidSignature = false;
      let signatureSource = 'raw-body';

      if (rawBody) {
        isValidSignature = await webhookConsumer.verifySignature(
          rawBody.toString('utf8'),
          headers,
        );
      }

      if (!isValidSignature) {
        const validViaStringify = await webhookConsumer.verifySignature(
          JSON.stringify(body),
          headers,
        );
        if (validViaStringify) {
          isValidSignature = true;
          signatureSource = 'json-stringify';
        }
      }

      if (isValidSignature) {
        this.logger.info(`${provider} signature validated via ${signatureSource}`);
      }

      if (!isValidSignature) {
        // En un echo `from`/`to` están invertidos: lo manda el negocio (`from`) hacia el
        // cliente (`to`), al revés que un mensaje entrante.
        const fromPhoneNumber = webhookConsumer.getFromNumber();
        const toPhoneNumber = webhookConsumer.getToNumber();
        const isEcho = WBEventTypes.MsgEchoes == webhookConsumer.getWBEventType();
        const agentPhoneNumber = isEcho ? fromPhoneNumber : toPhoneNumber;
        this.logger.warn(
          `Invalid signature for message from ${maskPhone(fromPhoneNumber)} to ${toPhoneNumber}`,
        );
        await this.whatsappConfigService.updateConnectionStatusByPhoneNumber(agentPhoneNumber, 'DISCONNECTED');
        await this.whatsappConfigService.updateConnectionErrorByPhoneNumber(agentPhoneNumber, 'Invalid signature, contact Support Service');
        return res.status(HttpStatus.UNAUTHORIZED).send({ received: false });
      }

      // Un mensaje a la vez. Meta agrupa varios en un solo POST y su consumer lee uno
      // por payload, así que el lote se parte; YCloud siempre manda uno. Un webhook sin
      // mensajes (un acuse, otro `object`) sigue por el camino de un solo payload y lo
      // descarta la clasificación NotAllowed.
      const parts = provider === WEBHOOK_PROVIDER_META_WHATSAPP ? splitMetaWebhook(body) : [];
      const results: Record<string, unknown>[] = [];
      if (parts.length === 0) {
        results.push(await this.enqueueMessage(provider, webhookConsumer, body, current));
      } else {
        for (const part of parts) {
          const consumer = await this.payloadConsumerResolver.forProvider(provider, part);
          results.push(await this.enqueueMessage(provider, consumer, part, current));
        }
      }

      return res
        .status(HttpStatus.OK)
        .send(results.length === 1 ? results[0] : { received: true, messages: results });
    } catch (error) {
      // Nada se procesó, así que se libera el claim y se devuelve 500 para que
      // el proveedor reintente. Antes esto era irrecuperable: el ACK ya había salido.
      // En un lote de Meta, los mensajes que ya se encolaron conservan su claim: el
      // reintento del lote completo los descarta como duplicados.
      //
      // `provider`/`whatsappMessageId` pueden no haberse llegado a resolver si el fallo
      // ocurrió muy temprano (p.ej. el propio payloadConsumerResolver); en ese caso nunca
      // hubo un claim que liberar. `release` además ya tolera un claim inexistente sin
      // lanzar, así que este guard es solo para no llamarlo con `undefined` de más.
      if (provider && current.whatsappMessageId) {
        await this.webhookDedup.release(provider, current.whatsappMessageId);
      }

      this.logger.error('Whatsapp message could not be enqueued', {
        whatsappInboundMessageId: current.whatsappMessageId,
        agentPhoneNumber: current.agentPhoneNumber,
        userNumber: maskPhone(current.clientPhoneNumber),
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ received: false });
    }
  }

  /**
   * Procesa UN mensaje ya autenticado: deduplica, resuelve la cuenta, aplica lista negra y
   * estado del workflow, y lo deja en la ventana de agregación con su Cloud Task. Devuelve
   * el cuerpo de la respuesta para ese mensaje. Si lanza, `current` dice qué claim liberar.
   */
  private async enqueueMessage(
    provider: string,
    consumer: IWBPayloadConsumer,
    payload: WhatsAppBufferedEvent,
    current: WebhookMessageContext,
  ): Promise<Record<string, unknown>> {
    current.whatsappMessageId = undefined;
    current.agentPhoneNumber = undefined;
    current.clientPhoneNumber = undefined;

    const sendTime = consumer.getSendTime();
    const whatsappMessageId = consumer.getWhatsappMessageId();
    const messageType = consumer.getMessageType();
    const fromPhoneNumber = consumer.getFromNumber();
    const toPhoneNumber = consumer.getToNumber();
    const eventType = consumer.getWBEventType();

    // Los dos tipos de evento traen el mensaje bajo una llave distinta, y en el echo
    // `from`/`to` están invertidos: lo manda el negocio (`from`) hacia el cliente (`to`),
    // al revés que un mensaje entrante.
    const isEcho = WBEventTypes.MsgEchoes == eventType;
    const agentPhoneNumber = isEcho ? fromPhoneNumber : toPhoneNumber;
    const clientPhoneNumber = isEcho ? toPhoneNumber : fromPhoneNumber;
    current.agentPhoneNumber = agentPhoneNumber;
    current.clientPhoneNumber = clientPhoneNumber;

    if (WBEventTypes.NotAllowed === eventType) {
      return { received: true };
    }

    if (!whatsappMessageId) {
      this.logger.warn(`Whatsapp message without ID from ${maskPhone(fromPhoneNumber)}`);
      return { received: true };
    }

    // Deduplicación: el proveedor reintenta, y reprocesar dispara el workflow dos
    //    veces (y con él, el cobro de créditos al tenant).
    const isNew = await this.webhookDedup.claim(
      provider,
      whatsappMessageId,
      messageType,
    );
    if (!isNew) {
      this.logger.warn(`Whatsapp message ${whatsappMessageId} duplicate, it's skipped`);
      return { received: true, duplicate: true };
    }
    // Solo a partir de aquí el claim es nuestro y le toca al catch liberarlo.
    current.whatsappMessageId = whatsappMessageId;

    // Resolver la cuenta y agendar el procesamiento. Todo esto es barato y va
    //    ANTES de responder: si algo falla, devolvemos un no-2xx y YCloud reintenta.
    const account = await this.whatsappConfigService.getWhatsappConfigByPhoneNumber(agentPhoneNumber);
    if (!account) {
      // El campo `reason` es lo que cuentan las métricas de Cloud Logging dadas de alta
      // para los descartes del webhook — no cambiar su valor sin actualizar el filtro
      // de la métrica correspondiente (whatsapp-discard-<reason>).
      this.logger.warn('No WhatsApp config found for phone number', {
        reason: 'unknown-config',
        agentPhoneNumber,
      });
      return { received: true, ignored: 'unknown-config' };
    }

    if (!account.isActive) {
      this.logger.warn('Received message for inactive WhatsApp config', {
        reason: 'inactive-config',
        agentPhoneNumber,
      });
      return { received: true, ignored: 'inactive-config' };
    }

    // Un número que un super admin no ha aprobado no es todavía de nadie: sus mensajes no se
    // entregan a la organización que lo registró (ver `approvedAt` en schema.prisma).
    if (!account.approvedAt) {
      this.logger.warn('Received message for unapproved WhatsApp config', {
        reason: 'unapproved-config',
        agentPhoneNumber,
      });
      return { received: true, ignored: 'unapproved-config' };
    }

    if (!account.defaultWorkflowId) {
      this.logger.warn('Received message for WhatsApp config with no associated workflow', {
        reason: 'no-workflow',
        whatsappConfigId: account.id,
      });
      return { received: true, ignored: 'no-workflow' };
    }
    // Interpretar el mensaje (incluida la transcripción de audio) cuesta una llamada a
    // Meta/YCloud por la multimedia y, en el peor caso, el STT: hacerlo aquí, antes del
    // ACK, es lo que hacía que un audio se transcribiera dos veces (una para nada, ya
    // que el flujo normal ni siquiera usa el resultado) y arriesgaba que el proveedor
    // diera por fallido el webhook si la transcripción tardaba. Solo dos ramas de abajo
    // (echo con humano interviniendo, workflow apagado) necesitan el texto para dejar
    // registro; se resuelve ahí, no aquí. El flujo normal solo encola el `body` crudo y
    // deja que `interpretMessages()` del worker lo interprete ya fuera del ciclo del
    // webhook.
    let cachedMessageText: string | undefined;
    const getMessageText = async (): Promise<string> => {
      if (cachedMessageText === undefined) {
        const interpreted = await consumer.getInterpretedMessage();
        // Un sticker o una foto sin pie no traen texto: sin el marcador, el mensaje no se
        // guardaba y desaparecía del historial.
        cachedMessageText = [interpreted.placeholder, interpreted.text]
          .filter(Boolean)
          .join('\n');
      }
      return cachedMessageText;
    };

    // Lista negra, ANTES de resolver el workflow. El orden importa: con el flujo apagado la
    // rama de abajo registra el mensaje, y si la comprobación fuera después, un contacto
    // bloqueado empezaría a acumular mensajes guardados cada vez que alguien apague el
    // workflow — justo lo que el bloqueo venía a evitar. El bloqueo es sobre la persona y
    // gana sobre cualquier estado del flujo.
    //
    // Solo aplica a lo que ENTRA: un echo es un mensaje que el negocio decidió mandar desde
    // su propio teléfono, y la lista negra nunca fue sobre lo que sale.
    //
    // Cortar en este punto significa que un contacto bloqueado no escribe al buffer de Redis,
    // no agenda una Cloud Task, no recibe palomita azul, no transcribe su audio, no ejecuta el
    // workflow y no cuesta un crédito. Es lo único que se gasta en él: un findUnique por llave
    // única. El mensaje no se guarda en ningún lado; esta línea de log —con el número
    // enmascarado y el id— es lo que permite rastrear un bloqueo por error, y Cloud Logging la
    // retiene 30 días sin costar una sola escritura en la base.
    if (!isEcho) {
      const isBlocked = await this.endUsersService.isBlocked(account.organizationId, {
        phoneNumber: clientPhoneNumber,
      });

      if (isBlocked) {
        this.logger.info('Mensaje de contacto bloqueado, se descarta', {
          organizationId: account.organizationId,
          agentPhoneNumber,
          userNumber: maskPhone(clientPhoneNumber),
          whatsappMessageId,
        });
        return { received: true, ignored: 'blocked-contact' };
      }
    }

    // Un workflow borrado (o de otra organización) no tiene a dónde rutear. No es
    // transitorio: reintentar no lo resucita, así que se corta aquí en vez de caer al
    // catch, devolver 500 y dejar a YCloud reintentando contra una config rota. Un fallo
    // de base sí lanza, y ese sí cae al catch y pide reintento, que es lo correcto.
    const workflow = await this.workflowsService.getRoutingState(
      account.organizationId,
      account.defaultWorkflowId,
    );
    if (!workflow) {
      this.logger.warn('Received message for WhatsApp config with missing workflow', {
        reason: 'missing-workflow',
        whatsappConfigId: account.id,
        workflowId: account.defaultWorkflowId,
      });
      return { received: true, ignored: 'missing-workflow' };
    }

    // Con el flujo apagado nadie más lleva la conversación al día: se registra el
    // mensaje sea cual sea su origen (cliente o negocio) para que el historial no se
    // quede corto.
    if (!workflow.isActive) {
      await this.recordMessageOutsideFlow(
        account.id,
        account.defaultWorkflowId,
        agentPhoneNumber,
        clientPhoneNumber,
        isEcho,
        await getMessageText(),
        'inactive-workflow',
      );
      this.logger.warn('Received message for WhatsApp config with inactive workflow', {
        reason: 'inactive-workflow',
        whatsappConfigId: account.id,
        workflowId: account.defaultWorkflowId,
      });
      return { received: true, ignored: 'inactive-workflow' };
    }

    // Los echoes reflejan mensajes que alguien del negocio mandó desde la app de WhatsApp
    // Business (coexistencia), fuera de nuestra API: no hay nada que ejecutar, pero se
    // guardan siempre. Lo que el bot manda por API no genera echo, así que no se duplica
    // nada. Va después de la rama del flujo apagado, que registra también los echoes.
    //
    // Si la conversación no estaba intervenida, una persona acaba de tomarla de facto: se
    // interviene para que el bot no siga contestando encima. Si el bot estaba generando en
    // ese momento, `execute()` vuelve a leer la bandera antes de guardar y descarta la
    // respuesta.
    if (isEcho) {
      const conversation = await this.conversationsService.findActiveWhatsappConversation(
        account.id,
        clientPhoneNumber,
      );
      const wasIntervened = conversation?.isHumanInTheLoop === true;

      const recorded = await this.recordMessageOutsideFlow(
        account.id,
        account.defaultWorkflowId,
        agentPhoneNumber,
        clientPhoneNumber,
        isEcho,
        await getMessageText(),
        wasIntervened ? 'human-in-the-loop' : 'human-takeover',
        conversation,
      );

      if (!wasIntervened) {
        // Aunque el echo no traiga nada que guardar, la persona igual contestó.
        const target =
          recorded ??
          conversation ??
          (await this.conversationsService.findOrCreateConversationFromWhatsAppMessage(
            account.defaultWorkflowId,
            agentPhoneNumber,
            clientPhoneNumber,
          ));
        await this.conversationsService.update(target.organizationId, target.id, {
          isHumanInTheLoop: true,
        });
        this.logger.info('Respuesta desde la app de WhatsApp Business: conversación intervenida', {
          organizationId: account.organizationId,
          agentPhoneNumber,
          userNumber: maskPhone(clientPhoneNumber),
          conversationId: target.id,
        });
      }
      return { received: true };
    }

    const bufferedAt = Date.now();
    const windowId = this.whatsappMessageQueueService.buildWindowId(bufferedAt);

    await this.whatsappMessageQueueService.bufferMessage(
      account.organizationId,
      agentPhoneNumber,
      clientPhoneNumber,
      {
        messageId: whatsappMessageId,
        sendTime: sendTime,
        bufferedAt,
        event: payload,
      },
    );

    // El nombre de la tarea es determinista por ventana, así que el segundo y
    // tercer mensaje de la misma ráfaga no agendan nada nuevo: Cloud Tasks
    // rechaza el nombre repetido. Si un mensaje cruza la frontera de tiempo y
    // agenda una tarea extra, el worker la resuelve como ventana vacía o la
    // reagenda; en ninguno de los dos casos se pierde nada.
    await this.cloudTasks.enqueue({
      path: WHATSAPP_WORKER_PATH,
      delaySeconds: WHATSAPP_WINDOW_SECONDS,
      taskId: [
        'wa',
        CloudTasksService.sanitizeIdPart(account.organizationId),
        CloudTasksService.sanitizeIdPart(agentPhoneNumber),
        CloudTasksService.sanitizeIdPart(clientPhoneNumber),
        windowId,
      ].join('-'),
      payload: {
        organizationId: account.organizationId,
        agentPhoneNumber,
        clientPhoneNumber,
        windowId,
        windowStartedAt: bufferedAt,
      },
    });

    return { received: true };
  }

  /**
   * Deja constancia en la conversación de un mensaje que el flujo no va a procesar: ya
   * sea un echo del negocio (evento `whatsapp.smb.message.echoes`) o, con el workflow
   * apagado, el mensaje mismo del cliente. El llamador decide cuándo corresponde —
   * workflow inactivo, o echo con la conversación intervenida (`isHumanInTheLoop`) —
   * este método solo escribe.
   */
  private async recordMessageOutsideFlow(
    whatsappConfigId: string,
    defaultWorkflowId: string,
    agentPhoneNumber: string,
    clientPhoneNumber: string,
    isEcho: boolean,
    content: string,
    reason: OutsideWorkflowReason,
    knownConversation?: { id: string; organizationId: string; metadata?: unknown } | null,
  ): Promise<{ id: string; organizationId: string } | null> {
    if (!content) {
      this.logger.warn(
        `Whatsapp message without text for config ${whatsappConfigId}, it's skipped`,
      );
      return null;
    }

    const conversation =
      knownConversation ??
      (await this.conversationsService.findActiveWhatsappConversation(
        whatsappConfigId,
        clientPhoneNumber,
      )) ??
      (await this.conversationsService.findOrCreateConversationFromWhatsAppMessage(
        defaultWorkflowId,
        agentPhoneNumber,
        clientPhoneNumber,
      ));

    await this.conversationsService.addMessage(
      conversation.id,
      isEcho ? ChatRole.ASSISTANT : ChatRole.USER,
      content,
      { source: isEcho ? 'whatsapp_smb_echo' : 'whatsapp_inbound_message' },
    );

    // El mensaje quedó con rol ASSISTANT pero lo mandó un humano, no el workflow: se
    // deja constancia en `metadata` para poder distinguir, en el historial, los turnos
    // que el bot nunca vio de los que sí generó.
    if (isEcho) {
      await this.conversationsService.markMessageOutsideWorkflow(
        conversation.organizationId,
        conversation.id,
        reason,
        conversation.metadata,
      );
    }

    return conversation;
  }

  // ─── Config CRUD ──────────────────────────────────────────────────────

  @Post('create-config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async createConfig(
    @CurrentUser() currUser: UserPayload,
    @Body() body: CreateConfigDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
    const apiResponse = new ApiResponseBuilder<boolean>();
    const existingConfig = await this.whatsappConfigService.getWhatsappConfigByPhoneNumber(
      body.phoneNumber,
    );
    if (existingConfig) {
      apiResponse
        .setStatusCode(HttpStatus.BAD_REQUEST)
        .setData(false)
        .setMessage('A WhatsApp config with this phone number already exists');
      return res.status(HttpStatus.BAD_REQUEST).json(apiResponse.build());
    }

    // `workflowId` ya no es obligatorio (la página de Canales puede dar de alta el
    // número sin asignarlo todavía), pero si viene, tiene que ser de esta organización
    // — el id llega del body, no hay que confiar en él a ciegas.
    if (body.workflowId) {
      const workflow = await this.workflowsService.getRoutingState(
        currUser.organizationId,
        body.workflowId,
      );
      if (!workflow) {
        apiResponse
          .setStatusCode(HttpStatus.BAD_REQUEST)
          .setData(false)
          .setMessage('Workflow not found in this organization');
        return res.status(HttpStatus.BAD_REQUEST).json(apiResponse.build());
      }
    }

    const response = await this.whatsappConfigService.createRecordAndgenerateWebhookSecret(
      currUser.organizationId,
      body.workflowId,
      body.phoneNumber,
    );
    if (response) {
      // Nace pendiente: no recibe ni envía nada hasta que un super admin lo aprueba.
      await this.whatsappConfigService.notifyNumberRequested(response, currUser);
      apiResponse
        .setStatusCode(HttpStatus.CREATED)
        .setData(true)
        .setMessage('WhatsApp number requested; pending approval');
      return res.status(HttpStatus.CREATED).json(apiResponse.build());
    }

    apiResponse
      .setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR)
      .setData(false)
      .setMessage('Failed to create WhatsApp config');
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(apiResponse.build());
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async deleteConfig(
    @CurrentUser() currUser: UserPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
    const apiResponse = new ApiResponseBuilder<boolean>();
    if (!(await this.findOwnedConfig(currUser.organizationId, id))) {
      return this.configNotFound(res);
    }
    const deleted = await this.whatsappConfigService.deleteRecord(id);
    if (deleted) {
      apiResponse
        .setStatusCode(HttpStatus.OK)
        .setData(true)
        .setMessage('WhatsApp config deleted successfully');
      return res.status(HttpStatus.OK).json(apiResponse.build());
    }

    apiResponse
      .setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR)
      .setData(false)
      .setMessage('Failed to delete WhatsApp config');
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(apiResponse.build());
  }

  @Get('list/:workflowId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async listConfigsByOrgAndWorkflow(
    @CurrentUser() currUser: UserPayload,
    @Param('workflowId') workflowId: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<PublicWhatsAppConfig[]>>> {
    const apiResponse = new ApiResponseBuilder<PublicWhatsAppConfig[]>();
    const records = await this.whatsappConfigService.getConfigsByOrganizationAndWorkflow(
      currUser.organizationId,
      workflowId,
    );
    apiResponse
      .setStatusCode(HttpStatus.OK)
      .setData(records.map(toPublicConfig))
      .setMessage('WhatsApp configs retrieved');
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }

  /** Edita los datos de un número desde la pantalla de configuración del canal. */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async updateConfig(
    @CurrentUser() currUser: UserPayload,
    @Param('id') id: string,
    @Body() body: UpdateWhatsappConfigDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
    const apiResponse = new ApiResponseBuilder<boolean>();

    if (!(await this.findOwnedConfig(currUser.organizationId, id))) {
      return this.configNotFound(res);
    }

    // Reasignar a un workflow ajeno no debería ser posible ni por error: se valida
    // igual que en createConfig. `null` (desasignar) no pasa por acá.
    if (body.workflowId) {
      const workflow = await this.workflowsService
        .findOne(currUser.organizationId, body.workflowId)
        .catch(() => null);
      if (!workflow) {
        apiResponse
          .setStatusCode(HttpStatus.BAD_REQUEST)
          .setData(false)
          .setMessage('Workflow not found in this organization');
        return res.status(HttpStatus.BAD_REQUEST).json(apiResponse.build());
      }
    }

    const success = await this.whatsappConfigService.updateConfig(id, body);
    if (success) {
      apiResponse
        .setStatusCode(HttpStatus.OK)
        .setData(true)
        .setMessage('WhatsApp config updated successfully');
      return res.status(HttpStatus.OK).json(apiResponse.build());
    }

    apiResponse
      .setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR)
      .setData(false)
      .setMessage('Failed to update WhatsApp config');
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(apiResponse.build());
  }

  @Patch(':id/isActive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async setIsActive(
    @CurrentUser() currUser: UserPayload,
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
    const apiResponse = new ApiResponseBuilder<boolean>();
    if (!(await this.findOwnedConfig(currUser.organizationId, id))) {
      return this.configNotFound(res);
    }
    const success = await this.whatsappConfigService.updateIsActive(id, isActive);
    if (success) {
      apiResponse
        .setStatusCode(HttpStatus.OK)
        .setData(true)
        .setMessage(`WhatsApp config isActive set to ${isActive}`);
      return res.status(HttpStatus.OK).json(apiResponse.build());
    }

    apiResponse
      .setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR)
      .setData(false)
      .setMessage('Failed to update isActive status');
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(apiResponse.build());
  }

  // ─── Templates ────────────────────────────────────────────────────────

  @Post(':configId/templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async createTemplate(
    @CurrentUser() currUser: UserPayload,
    @Param('configId') configId: string,
    @Body() body: CreateTemplateDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<WhatsAppTemplate>>> {
    if (!(await this.findOwnedConfig(currUser.organizationId, configId))) {
      return this.configNotFound(res);
    }
    const apiResponse = new ApiResponseBuilder<WhatsAppTemplate>();
    const template = await this.whatsappConfigService.createTemplate(configId, body);
    apiResponse.setStatusCode(HttpStatus.CREATED).setData(template).setMessage('Template created');
    return res.status(HttpStatus.CREATED).json(apiResponse.build());
  }

  @Get(':configId/templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
  async listTemplates(
    @CurrentUser() currUser: UserPayload,
    @Param('configId') configId: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<WhatsAppTemplate[]>>> {
    if (!(await this.findOwnedConfig(currUser.organizationId, configId))) {
      return this.configNotFound(res);
    }
    const apiResponse = new ApiResponseBuilder<WhatsAppTemplate[]>();
    const templates = await this.whatsappConfigService.listTemplates(configId);
    apiResponse.setStatusCode(HttpStatus.OK).setData(templates).setMessage('Templates retrieved');
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }

  @Patch('templates/:templateId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async updateTemplate(
    @CurrentUser() currUser: UserPayload,
    @Param('templateId') templateId: string,
    @Body() body: UpdateTemplateDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<WhatsAppTemplate>>> {
    if (!(await this.findOwnedTemplate(currUser.organizationId, templateId))) {
      return this.templateNotFound(res);
    }
    const apiResponse = new ApiResponseBuilder<WhatsAppTemplate>();
    const template = await this.whatsappConfigService.updateTemplate(templateId, body);
    apiResponse.setStatusCode(HttpStatus.OK).setData(template).setMessage('Template updated');
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }

  @Delete('templates/:templateId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async deleteTemplate(
    @CurrentUser() currUser: UserPayload,
    @Param('templateId') templateId: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
    if (!(await this.findOwnedTemplate(currUser.organizationId, templateId))) {
      return this.templateNotFound(res);
    }
    const apiResponse = new ApiResponseBuilder<boolean>();
    const deleted = await this.whatsappConfigService.deleteTemplate(templateId);
    if (deleted) {
      apiResponse.setStatusCode(HttpStatus.OK).setData(true).setMessage('Template deleted');
      return res.status(HttpStatus.OK).json(apiResponse.build());
    }
    apiResponse
      .setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR)
      .setData(false)
      .setMessage('Failed to delete template');
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(apiResponse.build());
  }

  @Post('templates/:templateId/send')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async sendTemplate(
    @CurrentUser() currUser: UserPayload,
    @Param('templateId') templateId: string,
    @Body() body: SendTemplateDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
    const owned = await this.findOwnedTemplate(currUser.organizationId, templateId);
    if (!owned) {
      return this.templateNotFound(res);
    }
    const { template, config } = owned;
    // El número se usa como remitente con la llave global de YCloud: sin aprobar, podría
    // hablar en nombre de un negocio que no es el de esta organización.
    if (!config.approvedAt) {
      return this.configNotFound(res);
    }

    await this.whatsappConfigService.sendTemplateMessage(
      config.phoneNumber,
      body.to,
      template.name,
      template.language,
      body.variables,
    );

    const apiResponse = new ApiResponseBuilder<boolean>();
    apiResponse.setStatusCode(HttpStatus.OK).setData(true).setMessage('Template message sent');
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }

  // ─── Propiedad por organización ───────────────────────────────────────

  /**
   * Los ids de config y template llegan en la URL, así que ninguna ruta debe tocar la fila
   * sin antes confirmar que es de la organización de quien llama. Una fila ajena se contesta
   * igual que una inexistente (404), para no confirmar que el id existe.
   */
  private async findOwnedConfig(
    organizationId: string,
    configId: string,
  ): Promise<WhatsAppConfig | null> {
    const config = await this.whatsappConfigService.getWhatsappConfigById(configId);
    return config?.organizationId === organizationId ? config : null;
  }

  /** Un template no guarda la organización: se resuelve a través de su número. */
  private async findOwnedTemplate(
    organizationId: string,
    templateId: string,
  ): Promise<{ template: WhatsAppTemplate; config: WhatsAppConfig } | null> {
    const template = await this.whatsappConfigService.getTemplate(templateId);
    if (!template) return null;
    const config = await this.findOwnedConfig(organizationId, template.whatsAppConfigId);
    return config ? { template, config } : null;
  }

  private configNotFound(res: Response): Response {
    const apiResponse = new ApiResponseBuilder<boolean>()
      .setStatusCode(HttpStatus.NOT_FOUND)
      .setData(false)
      .setMessage('WhatsApp config not found');
    return res.status(HttpStatus.NOT_FOUND).json(apiResponse.build());
  }

  private templateNotFound(res: Response): Response {
    const apiResponse = new ApiResponseBuilder<boolean>()
      .setStatusCode(HttpStatus.NOT_FOUND)
      .setData(false)
      .setMessage('Template not found');
    return res.status(HttpStatus.NOT_FOUND).json(apiResponse.build());
  }
}

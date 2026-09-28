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
import { ApiResponse, ApiResponseBuilder } from '@tesseract/types';
import * as crypto from 'crypto';
import { Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  CreateConfigDto,
  CreateTemplateDto,
  SendTemplateDto,
  UpdateTemplateDto,
  UpdateWhatsappConfigDto
} from '../../dto';
import { IWBPayloadConsumer, WBEventTypes, WBInterpretedMessage } from '../../payload-consumers/wb-payload-consumer.interface';
import { WBPayloadConsumerResolver } from '../../payload-consumers/wb-payload-consumer.resolver';
import { WhatsappConfigService } from '../../whatsapp-config.service';
import {
  WHATSAPP_WINDOW_SECONDS,
  WhatsappMessageQueueService,
} from '../../whatsapp-message-queue.service';
import {
  WEBHOOK_PROVIDER_META_WHATSAPP,
  WEBHOOK_PROVIDER_YCLOUD,
  WHATSAPP_WORKER_PATH,
} from '../../whatsapp-worker.constants';
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
    // claim de deduplicación sin importar en qué punto haya fallado.
    let provider: string | undefined;
    let whatsappMessageId: string | undefined;
    let agentPhoneNumber: string | undefined;
    let clientPhoneNumber: string | undefined;
    let message: WBInterpretedMessage;

    try {
      let payloadConsumer: IWBPayloadConsumer;
      if (headers['ycloud-signature']) {
        provider = WEBHOOK_PROVIDER_YCLOUD;
      } else {
        provider = WEBHOOK_PROVIDER_META_WHATSAPP;
      }
      payloadConsumer = await this.payloadConsumerResolver.forProvider(provider, body);

      // Los dos tipos de evento traen el mensaje bajo una llave distinta, y en el echo
      // `from`/`to` están invertidos: lo manda el negocio (`from`) hacia el cliente (`to`),
      // al revés que un mensaje entrante.
      const sendTime = payloadConsumer.getSendTime();
      whatsappMessageId = payloadConsumer.getWhatsappMessageId();
      const messageType = payloadConsumer.getMessageType();
      const fromPhoneNumber = payloadConsumer.getFromNumber();
      const toPhoneNumber = payloadConsumer.getToNumber();
      const eventType = payloadConsumer.getWBEventType();

      const isEcho = WBEventTypes.MsgEchoes == eventType;
      agentPhoneNumber = isEcho ? fromPhoneNumber : toPhoneNumber;
      clientPhoneNumber = isEcho ? toPhoneNumber : fromPhoneNumber;

      // 1. Firma primero, antes de tocar la base de datos y antes de decidir NADA sobre
      // el payload — incluido si el evento es de un tipo que ni siquiera vamos a
      // procesar. Antes, un evento clasificado como NotAllowed contestaba 200 sin haber
      // validado la firma: un payload sin autenticar llegaba a parsearse y clasificarse
      // igual que uno legítimo.
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
        isValidSignature = await payloadConsumer.verifySignature(
          rawBody.toString('utf8'),
          headers,
        );
      }

      if (!isValidSignature) {
        const validViaStringify = await payloadConsumer.verifySignature(
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
        this.logger.warn(
          `Invalid signature for message from ${maskPhone(fromPhoneNumber)} to ${toPhoneNumber}`,
        );
        await this.whatsappConfigService.updateConnectionStatusByPhoneNumber(agentPhoneNumber, 'DISCONNECTED');
        await this.whatsappConfigService.updateConnectionErrorByPhoneNumber(agentPhoneNumber, 'Invalid signature, contact Support Service');
        return res.status(HttpStatus.UNAUTHORIZED).send({ received: false });
      }

      if (WBEventTypes.NotAllowed === eventType) {
        return res.status(HttpStatus.OK).send({ received: true });
      }

      if (!whatsappMessageId) {
        this.logger.warn(`Whatsapp message without ID from ${maskPhone(fromPhoneNumber)}`);
        return res.status(HttpStatus.OK).send({ received: true });
      }

      // 2. Deduplicación: YCloud reintenta, y reprocesar dispara el workflow dos
      //    veces (y con él, el cobro de créditos al tenant).
      const isNew = await this.webhookDedup.claim(
        provider,
        whatsappMessageId,
        messageType,
      );
      if (!isNew) {
        this.logger.warn(`Whatsapp message ${whatsappMessageId} duplicate, it's skipped`);
        return res.status(HttpStatus.OK).send({ received: true, duplicate: true });
      }

      // 3. Resolver la cuenta y agendar el procesamiento. Todo esto es barato y va
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
        return res.status(HttpStatus.OK).send({ received: true, ignored: 'unknown-config' });
      }

      if (!account.isActive) {
        this.logger.warn('Received message for inactive WhatsApp config', {
          reason: 'inactive-config',
          agentPhoneNumber,
        });
        return res.status(HttpStatus.OK).send({ received: true, ignored: 'inactive-config' });
      }

      if (!account.defaultWorkflowId) {
        this.logger.warn('Received message for WhatsApp config with no associated workflow', {
          reason: 'no-workflow',
          whatsappConfigId: account.id,
        });
        return res.status(HttpStatus.OK).send({ received: true, ignored: 'no-workflow' });
      }

      message = await payloadConsumer.getInterpretedMessage();


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
          return res.status(HttpStatus.OK).send({ received: true, ignored: 'blocked-contact' });
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
        return res.status(HttpStatus.OK).send({ received: true, ignored: 'missing-workflow' });
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
          message.text || '',
          'inactive-workflow',
        );
        this.logger.warn('Received message for WhatsApp config with inactive workflow', {
          reason: 'inactive-workflow',
          whatsappConfigId: account.id,
          workflowId: account.defaultWorkflowId,
        });
        return res.status(HttpStatus.OK).send({ received: true, ignored: 'inactive-workflow' });
      }

      // Los echoes reflejan mensajes que el negocio ya mandó desde la app de WhatsApp
      // Business, fuera de nuestra API: no hay nada que ejecutar. Con el flujo activo
      // solo hace falta registrarlos si alguien intervino la conversación a mano; si no,
      // `execute()` es quien la lleva al día y sumar el echo aquí la duplicaría.
      if (isEcho) {
        const conversation = await this.conversationsService.findActiveWhatsappConversation(
          account.id,
          clientPhoneNumber,
        );
        if (conversation?.isHumanInTheLoop === true) {
          await this.recordMessageOutsideFlow(
            account.id,
            account.defaultWorkflowId,
            agentPhoneNumber,
            clientPhoneNumber,
            isEcho,
            message.text || '',
            'human-in-the-loop',
            conversation,
          );
        }
        return res.status(HttpStatus.OK).send({ received: true });
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
          event: body,
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

      return res.status(HttpStatus.OK).send({ received: true });
    } catch (error) {
      // Nada se procesó, así que se libera el claim y se devuelve 500 para que
      // el proveedor reintente. Antes esto era irrecuperable: el ACK ya había salido.
      //
      // `provider`/`whatsappMessageId` pueden no haberse llegado a resolver si el fallo
      // ocurrió muy temprano (p.ej. el propio payloadConsumerResolver); en ese caso nunca
      // hubo un claim que liberar. `release` además ya tolera un claim inexistente sin
      // lanzar, así que este guard es solo para no llamarlo con `undefined` de más.
      if (provider && whatsappMessageId) {
        await this.webhookDedup.release(provider, whatsappMessageId);
      }

      this.logger.error('Whatsapp message could not be enqueued', {
        whatsappInboundMessageId: whatsappMessageId,
        agentPhoneNumber,
        userNumber: maskPhone(clientPhoneNumber),
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ received: false });
    }
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
  ): Promise<void> {
    if (!content) {
      this.logger.warn(
        `Whatsapp message without text for config ${whatsappConfigId}, it's skipped`,
      );
      return;
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
  }

  // ─── Config CRUD ──────────────────────────────────────────────────────

  @Post('create-config')
  @UseGuards(JwtAuthGuard)
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
      apiResponse
        .setStatusCode(HttpStatus.CREATED)
        .setData(true)
        .setMessage('WhatsApp config created successfully');
      return res.status(HttpStatus.CREATED).json(apiResponse.build());
    }

    apiResponse
      .setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR)
      .setData(false)
      .setMessage('Failed to create WhatsApp config');
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(apiResponse.build());
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteConfig(
    @CurrentUser() _currUser: UserPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
    const apiResponse = new ApiResponseBuilder<boolean>();
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
  @UseGuards(JwtAuthGuard)
  async listConfigsByOrgAndWorkflow(
    @CurrentUser() currUser: UserPayload,
    @Param('workflowId') workflowId: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<WhatsAppConfig[]>>> {
    const apiResponse = new ApiResponseBuilder<WhatsAppConfig[]>();
    const records = await this.whatsappConfigService.getConfigsByOrganizationAndWorkflow(
      currUser.organizationId,
      workflowId,
    );
    apiResponse
      .setStatusCode(HttpStatus.OK)
      .setData(records)
      .setMessage('WhatsApp configs retrieved');
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }

  /** Edita los datos de un número desde la pantalla de configuración del canal. */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateConfig(
    @CurrentUser() currUser: UserPayload,
    @Param('id') id: string,
    @Body() body: UpdateWhatsappConfigDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
    const apiResponse = new ApiResponseBuilder<boolean>();

    // El id viene de la URL, así que hay que comprobar que la fila es de la
    // organización de quien llama antes de escribir en ella.
    const config = await this.whatsappConfigService.getWhatsappConfigById(id);
    if (!config || config.organizationId !== currUser.organizationId) {
      apiResponse
        .setStatusCode(HttpStatus.NOT_FOUND)
        .setData(false)
        .setMessage('WhatsApp config not found');
      return res.status(HttpStatus.NOT_FOUND).json(apiResponse.build());
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
  @UseGuards(JwtAuthGuard)
  async setIsActive(
    @CurrentUser() currUser: UserPayload,
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
    const apiResponse = new ApiResponseBuilder<boolean>();
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
  @UseGuards(JwtAuthGuard)
  async createTemplate(
    @Param('configId') configId: string,
    @Body() body: CreateTemplateDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<WhatsAppTemplate>>> {
    const apiResponse = new ApiResponseBuilder<WhatsAppTemplate>();
    const template = await this.whatsappConfigService.createTemplate(configId, body);
    apiResponse.setStatusCode(HttpStatus.CREATED).setData(template).setMessage('Template created');
    return res.status(HttpStatus.CREATED).json(apiResponse.build());
  }

  @Get(':configId/templates')
  @UseGuards(JwtAuthGuard)
  async listTemplates(
    @Param('configId') configId: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<WhatsAppTemplate[]>>> {
    const apiResponse = new ApiResponseBuilder<WhatsAppTemplate[]>();
    const templates = await this.whatsappConfigService.listTemplates(configId);
    apiResponse.setStatusCode(HttpStatus.OK).setData(templates).setMessage('Templates retrieved');
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }

  @Patch('templates/:templateId')
  @UseGuards(JwtAuthGuard)
  async updateTemplate(
    @Param('templateId') templateId: string,
    @Body() body: UpdateTemplateDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<WhatsAppTemplate>>> {
    const apiResponse = new ApiResponseBuilder<WhatsAppTemplate>();
    const template = await this.whatsappConfigService.updateTemplate(templateId, body);
    apiResponse.setStatusCode(HttpStatus.OK).setData(template).setMessage('Template updated');
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }

  @Delete('templates/:templateId')
  @UseGuards(JwtAuthGuard)
  async deleteTemplate(
    @CurrentUser() _currUser: UserPayload,
    @Param('templateId') templateId: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
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
  @UseGuards(JwtAuthGuard)
  async sendTemplate(
    @Param('templateId') templateId: string,
    @Body() body: SendTemplateDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
    const apiResponse = new ApiResponseBuilder<boolean>();
    const template = await this.whatsappConfigService.getTemplate(templateId);
    if (!template) {
      apiResponse
        .setStatusCode(HttpStatus.NOT_FOUND)
        .setData(false)
        .setMessage('Template not found');
      return res.status(HttpStatus.NOT_FOUND).json(apiResponse.build());
    }

    const config = await this.whatsappConfigService.getWhatsappConfigById(
      template.whatsAppConfigId,
    );
    if (!config) {
      apiResponse
        .setStatusCode(HttpStatus.NOT_FOUND)
        .setData(false)
        .setMessage('WhatsApp config not found');
      return res.status(HttpStatus.NOT_FOUND).json(apiResponse.build());
    }

    await this.whatsappConfigService.sendTemplateMessage(
      config.phoneNumber,
      body.to,
      template.name,
      template.language,
      body.variables,
    );

    apiResponse.setStatusCode(HttpStatus.OK).setData(true).setMessage('Template message sent');
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }

}

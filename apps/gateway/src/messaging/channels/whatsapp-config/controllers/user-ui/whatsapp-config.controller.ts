import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ChatRole, WhatsAppConfig, WhatsAppTemplate } from '@tesseract/database';
import { ApiResponse, ApiResponseBuilder } from '@tesseract/types';
import { Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { maskPhone } from '@/platform/common/utils/mask-phone';
import { WhatsappConfigService } from '../../whatsapp-config.service';
import {
  WHATSAPP_WINDOW_SECONDS,
  WhatsappMessageQueueService,
} from '../../whatsapp-message-queue.service';
import {
  CreateConfigDto,
  WhatsAppInboundEvent,
  CreateTemplateDto,
  UpdateTemplateDto,
  UpdateWhatsappConfigDto,
  SendTemplateDto,
} from '../../dto';
import { CloudTasksService } from '@/platform/tasks/cloud-tasks.service';
import { WebhookDedupService } from '@/platform/webhooks/webhook-dedup.service';
import {
  WEBHOOK_PROVIDER_YCLOUD,
  WHATSAPP_WORKER_PATH,
} from '../../whatsapp-worker.constants';
import { WorkflowsService } from '@/automation/workflows/workflows.service';
import {
  ConversationsService,
  OutsideWorkflowReason,
} from '@/messaging/conversations/conversations.service';
import { EndUsersService } from '@/identity/end-users/end-users.service';

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
  ) {}

  // ─── Webhook ──────────────────────────────────────────────────────────

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
    const parsedBody = body as WhatsAppInboundEvent;
    const eventType = parsedBody?.type;

    if (
      eventType !== 'whatsapp.inbound_message.received' &&
      eventType !== 'whatsapp.smb.message.echoes'
    ) {
      return res.status(HttpStatus.OK).send({ received: true });
    }

    // Los dos tipos de evento traen el mensaje bajo una llave distinta, y en el echo
    // `from`/`to` están invertidos: lo manda el negocio (`from`) hacia el cliente (`to`),
    // al revés que un mensaje entrante.
    const isEcho = eventType === 'whatsapp.smb.message.echoes';
    const whatsappMessageId = isEcho
      ? parsedBody.whatsappMessage?.id
      : parsedBody.whatsappInboundMessage?.id;
    const phoneNumber =
      (isEcho ? parsedBody.whatsappMessage?.from : parsedBody.whatsappInboundMessage?.to) ||
      'unknown';
    const userNumber =
      (isEcho ? parsedBody.whatsappMessage?.to : parsedBody.whatsappInboundMessage?.from) ||
      'unknown';
    // 1. Firma primero, antes de tocar la base de datos.
    //
    // Lo correcto es firmar sobre el body crudo; el código anterior usaba
    // JSON.stringify(body), que solo funciona si la re-serialización coincide
    // byte a byte con lo que envió YCloud. Se intenta el raw body y, si no
    // valida, se cae al comportamiento viejo para no romper producción.
    // TODO(webhook-firma): revisar los logs de `signatureSource` unos días y,
    // si nunca aparece 'json-stringify', eliminar el fallback.
    const signatureHeader = headers['ycloud-signature'] || '';
    const rawBody = (res.req as unknown as { rawBody?: Buffer }).rawBody;

    let isValidSignature = false;
    let signatureSource = 'raw-body';

    if (rawBody) {
      isValidSignature = this.whatsappConfigService.verifySignature(
        rawBody.toString('utf8'),
        signatureHeader,
      );
    }

    if (!isValidSignature) {
      const validViaStringify = this.whatsappConfigService.verifySignature(
        JSON.stringify(body),
        signatureHeader,
      );
      if (validViaStringify) {
        isValidSignature = true;
        signatureSource = 'json-stringify';
      }
    }

    if (isValidSignature) {
      this.logger.info(`YCloud signature validated via ${signatureSource}`);
    }

    if (!isValidSignature) {
      this.logger.warn(
        `Invalid signature for message from ${maskPhone(userNumber)} to ${phoneNumber}`,
      );
      await this.whatsappConfigService.updateConnectionStatusByPhoneNumber(phoneNumber, 'DISCONNECTED');
      await this.whatsappConfigService.updateConnectionErrorByPhoneNumber(phoneNumber, 'Invalid signature, contact Support Service');
      return res.status(HttpStatus.UNAUTHORIZED).send({ received: false });
    }

    if (!whatsappMessageId) {
      this.logger.warn(`Whatsapp message without ID from ${maskPhone(userNumber)}`);
      return res.status(HttpStatus.OK).send({ received: true });
    }

    // 2. Deduplicación: YCloud reintenta, y reprocesar dispara el workflow dos
    //    veces (y con él, el cobro de créditos al tenant).
    const isNew = await this.webhookDedup.claim(
      WEBHOOK_PROVIDER_YCLOUD,
      whatsappMessageId,
      isEcho ? parsedBody.whatsappMessage?.type : parsedBody.whatsappInboundMessage?.type,
    );
    if (!isNew) {
      this.logger.warn(`Whatsapp message ${whatsappMessageId} duplicate, it's skipped`);
      return res.status(HttpStatus.OK).send({ received: true, duplicate: true });
    }

    // 3. Resolver la cuenta y agendar el procesamiento. Todo esto es barato y va
    //    ANTES de responder: si algo falla, devolvemos un no-2xx y YCloud reintenta.
    try {
      const account = await this.whatsappConfigService.getWhatsappConfigByPhoneNumber(phoneNumber);
      if (!account) {
        this.logger.warn(`No WhatsApp config found for phone number: ${phoneNumber}`);
        return res.status(HttpStatus.OK).send({ received: true, ignored: 'unknown-config' });
      }

      if (!account.isActive) {
        this.logger.warn(
          `Received message for inactive WhatsApp config with phone number: ${phoneNumber}`,
        );
        return res.status(HttpStatus.OK).send({ received: true, ignored: 'inactive-config' });
      }

      if (!account.defaultWorkflowId) {
        this.logger.warn(
          `Received message for WhatsApp config with no associated workflow: ${account.id}`,
        );
        return res.status(HttpStatus.OK).send({ received: true, ignored: 'no-workflow' });
      }

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
          phoneNumber: userNumber,
        });

        if (isBlocked) {
          this.logger.info('Mensaje de contacto bloqueado, se descarta', {
            organizationId: account.organizationId,
            phoneNumber,
            userNumber: maskPhone(userNumber),
            whatsappMessageId,
          });
          return res.status(HttpStatus.OK).send({ received: true, ignored: 'blocked-contact' });
        }
      }

      // Un workflow borrado (o de otra organización) deja `findOne` lanzando. No es
      // transitorio: reintentar no lo resucita, así que se corta aquí en vez de caer al
      // catch, devolver 500 y dejar a YCloud reintentando contra una config rota.
      let workflow: { isActive: boolean };
      try {
        workflow = await this.workflowsService.findOne(
          account.organizationId,
          account.defaultWorkflowId,
        );
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
        this.logger.warn(
          `Received message for WhatsApp config with missing workflow: ${account.defaultWorkflowId}`,
        );
        return res.status(HttpStatus.OK).send({ received: true, ignored: 'missing-workflow' });
      }

      // Con el flujo apagado nadie más lleva la conversación al día: se registra el
      // mensaje sea cual sea su origen (cliente o negocio) para que el historial no se
      // quede corto.
      if (!workflow.isActive) {
        await this.recordMessageOutsideFlow(
          account.id,
          account.defaultWorkflowId,
          phoneNumber,
          userNumber,
          parsedBody,
          isEcho,
          'inactive-workflow',
        );
        this.logger.warn(
          `Received message for WhatsApp config with inactive workflow: ${account.defaultWorkflowId}`,
        );
        return res.status(HttpStatus.OK).send({ received: true, ignored: 'inactive-workflow' });
      }

      // Los echoes reflejan mensajes que el negocio ya mandó desde la app de WhatsApp
      // Business, fuera de nuestra API: no hay nada que ejecutar. Con el flujo activo
      // solo hace falta registrarlos si alguien intervino la conversación a mano; si no,
      // `execute()` es quien la lleva al día y sumar el echo aquí la duplicaría.
      if (isEcho) {
        const conversation = await this.conversationsService.findActiveWhatsappConversation(
          account.id,
          userNumber,
        );
        if (conversation?.isHumanInTheLoop === true) {
          await this.recordMessageOutsideFlow(
            account.id,
            account.defaultWorkflowId,
            phoneNumber,
            userNumber,
            parsedBody,
            isEcho,
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
        phoneNumber,
        userNumber,
        {
          messageId: whatsappMessageId,
          sendTime: parsedBody.whatsappInboundMessage?.sendTime || new Date().toISOString(),
          bufferedAt,
          event: parsedBody,
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
          CloudTasksService.sanitizeIdPart(phoneNumber),
          CloudTasksService.sanitizeIdPart(userNumber),
          windowId,
        ].join('-'),
        payload: {
          organizationId: account.organizationId,
          phoneNumber,
          userNumber,
          windowId,
          windowStartedAt: bufferedAt,
        },
      });

      return res.status(HttpStatus.OK).send({ received: true });
    } catch (error) {
      // Nada se procesó, así que se libera el claim y se devuelve 500 para que
      // YCloud reintente. Antes esto era irrecuperable: el ACK ya había salido.
      await this.webhookDedup.release(WEBHOOK_PROVIDER_YCLOUD, whatsappMessageId);

      this.logger.error('Whatsapp message could not be enqueued', {
        whatsappInboundMessageId: whatsappMessageId,
        phoneNumber,
        userNumber: maskPhone(userNumber),
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
    phoneNumber: string,
    userNumber: string,
    event: WhatsAppInboundEvent,
    isEcho: boolean,
    reason: OutsideWorkflowReason,
    knownConversation?: { id: string; organizationId: string; metadata?: unknown } | null,
  ): Promise<void> {
    const content = isEcho
      ? event.whatsappMessage?.text?.body
      : event.whatsappInboundMessage?.text?.body;
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
        userNumber,
      )) ??
      (await this.conversationsService.findOrCreateConversationFromWhatsAppMessage(
        defaultWorkflowId,
        phoneNumber,
        userNumber,
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

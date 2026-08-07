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
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { MessengerConfig } from '@tesseract/database';
import { ApiResponse, ApiResponseBuilder } from '@tesseract/types';
import { Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { WorkflowsService } from '@/automation/workflows/workflows.service';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { CloudTasksService } from '@/platform/tasks/cloud-tasks.service';
import { WebhookDedupService } from '@/platform/webhooks/webhook-dedup.service';
import { CreateConfigDto, MessengerInboundEvent, UpdatePageAccessTokenDto } from '../../dto';
import { MessengerWebhookPayload } from '../../dto/messenger-inbound-event.dto';
import { MessengerConfigService } from '../../messenger-config.service';
import {
  MESSENGER_WINDOW_SECONDS,
  MessengerMessageQueueService,
} from '../../messenger-message-queue.service';
import {
  MESSENGER_TASK_PREFIX,
  MESSENGER_WORKER_PATH,
  WEBHOOK_PROVIDER_MESSENGER,
} from '../../messenger-worker.constants';

@Controller('messenger')
export class MessengerController {
  constructor(
    private readonly messengerConfigService: MessengerConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly messengerMessageQueueService: MessengerMessageQueueService,
    private readonly cloudTasks: CloudTasksService,
    private readonly webhookDedup: WebhookDedupService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  // ─── Webhook ──────────────────────────────────────────────────────────

  /**
   * Challenge de suscripción del webhook.
   *
   * Meta lo llama al dar de alta el endpoint y al reconfigurarlo. El token vive en
   * `MESSENGER_VERIFY_TOKEN`, no en el código.
   *
   * https://developers.facebook.com/docs/messenger-platform/webhooks#verification-requests
   */
  @SkipThrottle()
  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (!this.messengerConfigService.verifySubscription(mode, verifyToken)) {
      this.logger.warn('Challenge de Messenger rechazado: modo o token inválidos');
      return res.sendStatus(HttpStatus.FORBIDDEN);
    }

    this.logger.info('Webhook de Messenger verificado');
    return res.status(HttpStatus.OK).send(challenge);
  }

  /**
   * Webhook de mensajes entrantes de Messenger.
   *
   * Sigue el mismo contrato que el de WhatsApp: este handler solo acusa recibo
   * —verifica firma, deduplica, guarda el mensaje en la ventana de agregación y encola
   * una tarea—, todo dentro del ciclo de la request. El trabajo pesado (transcripción,
   * ejecución del workflow, respuesta) vive en `MessengerWorkerController`, porque
   * Cloud Run estrangula la CPU en cuanto la respuesta sale.
   *
   * La diferencia con YCloud es la forma del payload: Meta agrupa varios eventos —de
   * varias páginas incluso— en un solo POST, así que hay que aplanar `entry[].messaging[]`
   * y tratar cada elemento como un mensaje independiente.
   *
   * El ThrottlerGuard global (20 req/60s por IP) no aplica: todas las entregas salen de
   * un puñado de IPs de Meta, así que comparten un solo bucket y una ráfaga normal de
   * mensajes se llevaría 429. Lo que protege este endpoint es la firma HMAC y la
   * deduplicación, no un límite por IP.
   */
  @SkipThrottle()
  @Post('webhook')
  async handleWebhook(@Body() body: any, @Res() res: Response, @Headers() headers: any) {
    const parsedBody = body as MessengerWebhookPayload;

    // 1. Firma primero, antes de tocar la base de datos.
    //
    // Se firma sobre el body crudo: Meta escapa los caracteres no-ASCII a su manera y
    // `JSON.stringify(body)` no reproduce esos bytes, así que la firma no cuadraría.
    const signatureHeader = headers['x-hub-signature-256'] || '';
    const rawBody = (res.req as unknown as { rawBody?: Buffer }).rawBody;

    if (!rawBody) {
      this.logger.error('Webhook de Messenger sin raw body; no se puede validar la firma');
      return res.status(HttpStatus.UNAUTHORIZED).send({ received: false });
    }

    if (!this.messengerConfigService.verifySignature(rawBody.toString('utf8'), signatureHeader)) {
      this.logger.warn('Firma inválida en webhook de Messenger');
      return res.status(HttpStatus.UNAUTHORIZED).send({ received: false });
    }

    if (parsedBody?.object !== 'page') {
      // Instagram y WhatsApp comparten el mecanismo de webhooks de Meta; si la app
      // llega a suscribirse a otro producto, esto evita procesarlo como Messenger.
      this.logger.warn(`Webhook de Messenger con object inesperado: ${parsedBody?.object}`);
      return res.status(HttpStatus.OK).send({ received: true, ignored: 'unsupported-object' });
    }

    const events = this.flattenEvents(parsedBody);
    if (events.length === 0) {
      // Acuses de entrega, lecturas y ecos de la propia página caen aquí. Son normales.
      return res.status(HttpStatus.OK).send({ received: true, ignored: 'no-messages' });
    }

    // 2. Cada evento se reclama, resuelve y encola por separado. Si uno falla se
    //    devuelve 500 y Meta reintenta el POST completo; los que sí se procesaron
    //    conservan su claim, así que el reintento solo retoma el que quedó pendiente.
    const results: Record<string, unknown>[] = [];

    for (const event of events) {
      try {
        results.push(await this.scheduleEvent(event));
      } catch (error) {
        await this.webhookDedup.release(WEBHOOK_PROVIDER_MESSENGER, event.messageId);

        this.logger.error('No se pudo encolar el mensaje de Messenger', {
          messageId: event.messageId,
          pageId: event.pageId,
          senderId: event.senderId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ received: false });
      }
    }

    return res.status(HttpStatus.OK).send({ received: true, events: results });
  }

  /**
   * Aplana el payload de Meta a la unidad con la que trabaja el resto del canal.
   *
   * Descarta lo que no es un mensaje del usuario: acuses de entrega y de lectura, y los
   * ecos de la propia página —sin ese filtro el bot se contestaría a sí mismo en bucle.
   */
  private flattenEvents(payload: MessengerWebhookPayload): MessengerInboundEvent[] {
    const events: MessengerInboundEvent[] = [];

    for (const entry of payload.entry ?? []) {
      for (const messaging of entry.messaging ?? []) {
        if (messaging.message?.is_echo) continue;

        const messageId = messaging.message?.mid ?? messaging.postback?.mid;
        const senderId = messaging.sender?.id;
        // `entry.id` es la página; se prefiere `recipient.id` porque es el destinatario
        // real del evento y coincide con la página en los mensajes entrantes.
        const pageId = messaging.recipient?.id ?? entry.id;

        if (!messageId || !senderId || !pageId) continue;
        if (!messaging.message && !messaging.postback) continue;

        events.push({
          pageId,
          senderId,
          messageId,
          timestamp: messaging.timestamp,
          messaging,
        });
      }
    }

    return events;
  }

  /**
   * Deduplica, valida la config y agenda el procesamiento de un evento.
   *
   * Devuelve el detalle de lo que pasó con ese mensaje. Lanza solo ante fallos
   * transitorios (base de datos, Redis, Cloud Tasks), que son los que sí ameritan que
   * Meta reintente.
   */
  private async scheduleEvent(event: MessengerInboundEvent): Promise<Record<string, unknown>> {
    const { messageId, pageId, senderId } = event;

    // Deduplicación: Meta reintenta, y reprocesar dispara el workflow dos veces (y con
    // él, el cobro de créditos al tenant).
    const isNew = await this.webhookDedup.claim(
      WEBHOOK_PROVIDER_MESSENGER,
      messageId,
      event.messaging.postback ? 'postback' : 'message',
    );
    if (!isNew) {
      this.logger.warn(`Mensaje de Messenger ${messageId} duplicado, se omite`);
      return { messageId, duplicate: true };
    }

    const account = await this.messengerConfigService.getMessengerConfigByPageId(pageId);
    if (!account) {
      this.logger.warn(`No Messenger config found for page: ${pageId}`);
      return { messageId, ignored: 'unknown-config' };
    }

    if (!account.isActive) {
      this.logger.warn(`Received message for inactive Messenger config with page: ${pageId}`);
      return { messageId, ignored: 'inactive-config' };
    }

    if (!account.defaultWorkflowId) {
      this.logger.warn(
        `Received message for Messenger config with no associated workflow: ${account.id}`,
      );
      return { messageId, ignored: 'no-workflow' };
    }

    // Un workflow borrado deja `findOne` lanzando. No es transitorio: reintentar no lo
    // resucita, así que se corta aquí en vez de devolver 500 y dejar a Meta reintentando
    // contra una config rota.
    let workflowAssociated: { isActive: boolean };
    try {
      workflowAssociated = await this.workflowsService.findOne(
        account.organizationId,
        account.defaultWorkflowId,
      );
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
      this.logger.warn(
        `Received message for Messenger config with missing workflow: ${account.defaultWorkflowId}`,
      );
      return { messageId, ignored: 'missing-workflow' };
    }

    if (!workflowAssociated.isActive) {
      this.logger.warn(
        `Received message for Messenger config with inactive workflow: ${account.defaultWorkflowId}`,
      );
      return { messageId, ignored: 'inactive-workflow' };
    }

    const bufferedAt = Date.now();
    const windowId = this.messengerMessageQueueService.buildWindowId(bufferedAt);

    await this.messengerMessageQueueService.bufferMessage(
      account.organizationId,
      pageId,
      senderId,
      {
        messageId,
        sendTime: new Date(event.timestamp ?? bufferedAt).toISOString(),
        bufferedAt,
        event,
      },
    );

    // El nombre de la tarea es determinista por ventana, así que el segundo y tercer
    // mensaje de la misma ráfaga no agendan nada nuevo: Cloud Tasks rechaza el nombre
    // repetido. Si un mensaje cruza la frontera de tiempo y agenda una tarea extra, el
    // worker la resuelve como ventana vacía o la reagenda; no se pierde nada.
    await this.cloudTasks.enqueue({
      path: MESSENGER_WORKER_PATH,
      delaySeconds: MESSENGER_WINDOW_SECONDS,
      taskId: [
        MESSENGER_TASK_PREFIX,
        CloudTasksService.sanitizeIdPart(account.organizationId),
        CloudTasksService.sanitizeIdPart(pageId),
        CloudTasksService.sanitizeIdPart(senderId),
        windowId,
      ].join('-'),
      payload: {
        organizationId: account.organizationId,
        pageId,
        senderId,
        windowId,
        windowStartedAt: bufferedAt,
      },
    });

    return { messageId, scheduled: true, windowId };
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
    const existingConfig = await this.messengerConfigService.getMessengerConfigByPageId(
      body.pageId,
    );
    if (existingConfig) {
      apiResponse
        .setStatusCode(HttpStatus.BAD_REQUEST)
        .setData(false)
        .setMessage('A Messenger config with this page id already exists');
      return res.status(HttpStatus.BAD_REQUEST).json(apiResponse.build());
    }

    const response = await this.messengerConfigService.createRecordAndgenerateWebhookSecret(
      currUser.organizationId,
      body.workflowId,
      body.pageId,
      body.pageName,
      body.pageAccessToken,
    );
    if (response) {
      apiResponse
        .setStatusCode(HttpStatus.CREATED)
        .setData(true)
        .setMessage('Messenger config created successfully');
      return res.status(HttpStatus.CREATED).json(apiResponse.build());
    }

    apiResponse
      .setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR)
      .setData(false)
      .setMessage('Failed to create Messenger config');
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
    const deleted = await this.messengerConfigService.deleteRecord(id);
    if (deleted) {
      apiResponse
        .setStatusCode(HttpStatus.OK)
        .setData(true)
        .setMessage('Messenger config deleted successfully');
      return res.status(HttpStatus.OK).json(apiResponse.build());
    }

    apiResponse
      .setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR)
      .setData(false)
      .setMessage('Failed to delete Messenger config');
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(apiResponse.build());
  }

  @Get('list/:workflowId')
  @UseGuards(JwtAuthGuard)
  async listConfigsByOrgAndWorkflow(
    @CurrentUser() currUser: UserPayload,
    @Param('workflowId') workflowId: string,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<MessengerConfig[]>>> {
    const apiResponse = new ApiResponseBuilder<MessengerConfig[]>();
    const records = await this.messengerConfigService.getConfigsByOrganizationAndWorkflow(
      currUser.organizationId,
      workflowId,
    );
    apiResponse
      .setStatusCode(HttpStatus.OK)
      // El token de página nunca sale del backend, ni cifrado.
      .setData(records.map(({ pageAccessToken: _omitted, ...config }) => config as MessengerConfig))
      .setMessage('Messenger configs retrieved');
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }

  @Patch(':id/isActive')
  @UseGuards(JwtAuthGuard)
  async setIsActive(
    @CurrentUser() _currUser: UserPayload,
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
    const apiResponse = new ApiResponseBuilder<boolean>();
    const success = await this.messengerConfigService.updateIsActive(id, isActive);
    if (success) {
      apiResponse
        .setStatusCode(HttpStatus.OK)
        .setData(true)
        .setMessage(`Messenger config isActive set to ${isActive}`);
      return res.status(HttpStatus.OK).json(apiResponse.build());
    }

    apiResponse
      .setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR)
      .setData(false)
      .setMessage('Failed to update isActive status');
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(apiResponse.build());
  }

  @Patch(':id/page-access-token')
  @UseGuards(JwtAuthGuard)
  async updatePageAccessToken(
    @CurrentUser() _currUser: UserPayload,
    @Param('id') id: string,
    @Body() body: UpdatePageAccessTokenDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
    const apiResponse = new ApiResponseBuilder<boolean>();
    const success = await this.messengerConfigService.updatePageAccessToken(
      id,
      body.pageAccessToken,
    );
    if (success) {
      apiResponse
        .setStatusCode(HttpStatus.OK)
        .setData(true)
        .setMessage('Messenger page access token updated');
      return res.status(HttpStatus.OK).json(apiResponse.build());
    }

    apiResponse
      .setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR)
      .setData(false)
      .setMessage('Failed to update page access token');
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(apiResponse.build());
  }
}

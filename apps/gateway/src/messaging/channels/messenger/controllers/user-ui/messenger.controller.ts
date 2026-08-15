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
import {
  CreateConfigDto,
  MessengerInboundEvent,
  UpdateAppSecretDto,
  UpdateMessengerConfigDto,
  UpdatePageAccessTokenDto,
} from '../../dto';
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

/** Config de una página más el veredicto de firma para el cuerpo de ESTA request. */
interface ResolvedPage {
  config: MessengerConfig | null;
  signatureValid: boolean;
}

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

    // Se firma sobre el body crudo: Meta escapa los caracteres no-ASCII a su manera y
    // `JSON.stringify(body)` no reproduce esos bytes, así que la firma no cuadraría.
    const signatureHeader = headers['x-hub-signature-256'] || '';
    const rawBody = (res.req as unknown as { rawBody?: Buffer }).rawBody;

    if (!rawBody) {
      this.logger.error('Webhook de Messenger sin raw body; no se puede validar la firma');
      await this.messengerConfigService.updateConnectionStatusByPageId(parsedBody?.entry?.[0]?.id ?? '', 'DISCONNECTED');
      await this.messengerConfigService.updateConnectionErrorByPageId(parsedBody?.entry?.[0]?.id ?? '', 'Webhook de Messenger sin raw body; no se puede validar la firma');
      return res.status(HttpStatus.UNAUTHORIZED).send({ received: false });
    }

    if (parsedBody?.object !== 'page') {
      // Instagram y WhatsApp comparten el mecanismo de webhooks de Meta; si la app
      // llega a suscribirse a otro producto, esto evita procesarlo como Messenger.
      this.logger.warn(`Webhook de Messenger con object inesperado, el object no es page: ${parsedBody?.object}`);
      await this.messengerConfigService.updateConnectionStatusByPageId(parsedBody?.entry?.[0]?.id ?? '', 'DISCONNECTED');
      await this.messengerConfigService.updateConnectionErrorByPageId(parsedBody?.entry?.[0]?.id ?? '', `Webhook de Messenger con object inesperado: ${parsedBody?.object}`);
      return res.status(HttpStatus.OK).send({ received: true, ignored: 'unsupported-object' });
    }

    const events = this.flattenEvents(parsedBody);
    if (events.length === 0) {
      // Acuses de entrega, lecturas y ecos de la propia página caen aquí. Son normales.
      return res.status(HttpStatus.OK).send({ received: true, ignored: 'no-messages' });
    }

    // Cada evento se autentica, reclama y encola por separado. Si uno falla por algo
    // transitorio se devuelve 500 y Meta reintenta el POST completo; los que sí se
    // procesaron conservan su claim, así que el reintento solo retoma el pendiente.
    const results: Record<string, unknown>[] = [];
    let authenticated = 0;
    let rejected = 0;

    // Memo por request, NO del controlador: Nest reutiliza la instancia entre
    // peticiones, y un veredicto de firma cacheado ahí valdría para un cuerpo
    // distinto del que lo produjo.
    const pageCache = new Map<string, ResolvedPage>();

    for (const event of events) {
      // El app secret vive en la config de la página, así que hay que resolverla antes
      // de poder validar. Es una LECTURA y nada más: no se toca la base hasta que la
      // firma cuadra, que es justo lo que evitaba el orden anterior.
      const account = await this.resolvePage(event.pageId, rawBody, signatureHeader, pageCache);

      if (!account.config) {
        this.logger.warn(`No Messenger config found for page: ${event.pageId}`);
        results.push({ messageId: event.messageId, ignored: 'unknown-config' });
        continue;
      }

      if (!account.signatureValid) {
        // Se valida por página, no por lote: aceptar el POST entero al primer acierto
        // dejaría que quien conoce el secreto de un tenant colase eventos de otro.
        this.logger.warn(
          `Firma inválida en webhook de Messenger para la página ${event.pageId}`,
        );
        rejected++;
        await this.messengerConfigService.updateConnectionStatusByPageId(event.pageId, 'DISCONNECTED');
        await this.messengerConfigService.updateConnectionErrorByPageId(event.pageId, 'Firma inválida en webhook de Messenger');
        results.push({ messageId: event.messageId, ignored: 'invalid-signature' });
        continue;
      }

      authenticated++;

      try {
        results.push(await this.scheduleEvent(event, account.config));
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

    // Si NADA se autenticó y hubo rechazos, el POST entero era ilegítimo o la config
    // tiene el secreto cambiado: 401, como antes. Un lote mixto sí responde 200, con
    // el detalle por evento, porque parte del trabajo sí quedó agendado.
    if (authenticated === 0 && rejected > 0) {
      return res.status(HttpStatus.UNAUTHORIZED).send({ received: false, events: results });
    }

    return res.status(HttpStatus.OK).send({ received: true, events: results });
  }

  /**
   * Resuelve la config de una página y valida la firma del cuerpo con SU app secret.
   *
   * `cache` memoriza el resultado por `pageId` dentro de UNA request: un POST trae
   * varios eventos de la misma página y no hay por qué repetir la consulta ni el
   * descifrado de KMS. El mapa lo crea quien llama, precisamente para que no
   * sobreviva a la request que lo produjo.
   */
  private async resolvePage(
    pageId: string,
    rawBody: Buffer,
    signatureHeader: string,
    cache: Map<string, ResolvedPage>,
  ): Promise<ResolvedPage> {
    const cached = cache.get(pageId);
    if (cached) {
      return cached;
    }

    const config = await this.messengerConfigService.getMessengerConfigByPageId(pageId);
    const signatureValid = config
      ? await this.messengerConfigService.verifySignature(
          rawBody.toString('utf8'),
          signatureHeader,
          config,
        )
      : false;

    const resolved: ResolvedPage = { config, signatureValid };
    cache.set(pageId, resolved);
    return resolved;
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
   * Recibe la config ya resuelta y con la firma comprobada: quien llama tuvo que
   * cargarla para poder validar, y repetir la consulta aquí solo añadiría una lectura
   * y la posibilidad de que las dos difieran.
   *
   * Devuelve el detalle de lo que pasó con ese mensaje. Lanza solo ante fallos
   * transitorios (base de datos, Redis, Cloud Tasks), que son los que sí ameritan que
   * Meta reintente.
   */
  private async scheduleEvent(
    event: MessengerInboundEvent,
    account: MessengerConfig,
  ): Promise<Record<string, unknown>> {
    const { messageId, pageId, senderId } = event;

    // Deduplicación: Meta reintenta, y reprocesar dispara el workflow dos veces (y con
    // él, el cobro de créditos al tenant). Va después de la firma: reclamar antes
    // dejaría que un POST sin autenticar quemase el id y silenciase el mensaje bueno.
    const isNew = await this.webhookDedup.claim(
      WEBHOOK_PROVIDER_MESSENGER,
      messageId,
      event.messaging.postback ? 'postback' : 'message',
    );
    if (!isNew) {
      this.logger.warn(`Mensaje de Messenger ${messageId} duplicado, se omite`);
      return { messageId, duplicate: true };
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

    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug('Webhook de Messenger recibido, payload completo', JSON.stringify(event, null, 2));
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

    const response = await this.messengerConfigService.createRecord(
      currUser.organizationId,
      body.workflowId,
      body.pageId,
      body.pageName,
      body.pageAccessToken,
      body.appSecret,
      body.description,
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
      // Ninguna de las dos credenciales sale del backend, ni cifrada.
      .setData(
        records.map(
          ({ pageAccessToken: _token, appSecret: _secret, ...config }) => config as MessengerConfig,
        ),
      )
      .setMessage('Messenger configs retrieved');
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }

  /**
   * Edita los datos de una página desde la pantalla de configuración del canal.
   *
   * Convive con los dos PATCH de credenciales, que siguen sirviendo para rotar una sola
   * cosa; este es el que respalda el formulario completo.
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateConfig(
    @CurrentUser() currUser: UserPayload,
    @Param('id') id: string,
    @Body() body: UpdateMessengerConfigDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
    const apiResponse = new ApiResponseBuilder<boolean>();

    // El id viene de la URL, así que hay que comprobar que la fila es de la
    // organización de quien llama antes de escribir en ella.
    const config = await this.messengerConfigService.getMessengerConfigById(id);
    if (!config || config.organizationId !== currUser.organizationId) {
      apiResponse
        .setStatusCode(HttpStatus.NOT_FOUND)
        .setData(false)
        .setMessage('Messenger config not found');
      return res.status(HttpStatus.NOT_FOUND).json(apiResponse.build());
    }

    const success = await this.messengerConfigService.updateConfig(id, body);
    if (success) {
      apiResponse
        .setStatusCode(HttpStatus.OK)
        .setData(true)
        .setMessage('Messenger config updated successfully');
      return res.status(HttpStatus.OK).json(apiResponse.build());
    }

    apiResponse
      .setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR)
      .setData(false)
      .setMessage('Failed to update Messenger config');
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(apiResponse.build());
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

  @Patch(':id/app-secret')
  @UseGuards(JwtAuthGuard)
  async updateAppSecret(
    @CurrentUser() _currUser: UserPayload,
    @Param('id') id: string,
    @Body() body: UpdateAppSecretDto,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
    const apiResponse = new ApiResponseBuilder<boolean>();
    const success = await this.messengerConfigService.updateAppSecret(id, body.appSecret);
    if (success) {
      apiResponse
        .setStatusCode(HttpStatus.OK)
        .setData(true)
        .setMessage('Messenger app secret updated');
      return res.status(HttpStatus.OK).json(apiResponse.build());
    }

    apiResponse
      .setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR)
      .setData(false)
      .setMessage('Failed to update app secret');
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(apiResponse.build());
  }
}

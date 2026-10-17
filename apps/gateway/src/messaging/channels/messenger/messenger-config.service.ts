import { HttpService } from '@nestjs/axios';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ChatRole, MessengerConfig, MessengerConnectionStatus } from '@tesseract/database';
import { JsonObject } from '@prisma/client/runtime/client';
import { isAxiosError } from 'axios';
import * as crypto from 'crypto';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { firstValueFrom } from 'rxjs';
import { Logger } from 'winston';
import { KmsService } from '@/automation/tools/core/kms.service';
import { ConversationsService } from '@/messaging/conversations/conversations.service';
import {
  PostTurnAction,
  PostTurnActionHandler,
  runPostTurnActions,
} from '@/messaging/post-turn-actions';
import { GoogleDriveService } from '@/platform/cloud/google-drive/google-drive.service';
import { PrismaService } from '@/platform/database/prisma.service';
import { toText } from '@/platform/common/utils/to-text';
import { httpErrorDetail } from '@/platform/common/utils/error-message';

const GRAPH_API_BASE = process.env.MESSENGER_GRAPH_API_BASE ?? 'https://graph.facebook.com/v21.0';

/**
 * Tope de la Send API. Un texto más largo se rechaza entero, así que se parte antes
 * de enviarlo en vez de perder la respuesta.
 * https://developers.facebook.com/docs/messenger-platform/reference/send-api
 */
const MESSENGER_MAX_TEXT_LENGTH = 2000;

/**
 * Lo que `GET /debug_token` cuenta de un token. Solo los campos que se usan; Meta manda
 * bastantes más.
 *
 * `profile_id` únicamente viene cuando `type` es `PAGE`, y es el id de esa página: es el
 * dato que prueba la propiedad. https://developers.facebook.com/docs/graph-api/reference/debug_token
 */
interface DebugTokenData {
  type?: 'PAGE' | 'USER' | 'APP' | 'SYSTEM_USER' | string;
  profile_id?: string;
  is_valid?: boolean;
  /** Epoch en segundos; 0 o ausente significa que no caduca. */
  expires_at?: number;
  scopes?: string[];
  error?: { code?: number; subcode?: number; message?: string };
}

@Injectable()
export class MessengerConfigService {
  /** App secret de respaldo, para despliegues de una sola app; ver `resolveAppSecret`. */
  private readonly fallbackAppSecret: string = process.env.MESSENGER_APP_SECRET ?? '';
  /** Token del challenge de verificación (GET /webhook). */
  private readonly verifyToken: string = process.env.MESSENGER_VERIFY_TOKEN ?? '';

  constructor(
    private readonly prismaService: PrismaService,
    private readonly httpService: HttpService,
    private readonly kmsService: KmsService,
    private readonly driveService: GoogleDriveService,
    private readonly conversationsService: ConversationsService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  // ─── Prueba de propiedad ──────────────────────────────────────────────

  /**
   * Comprueba con Meta que las credenciales son de esa página antes de guardarlas.
   *
   * El `pageId` es público y el webhook enruta por él, así que sin esto cualquiera podía dar
   * de alta la página de otro (o cambiar el `pageId` de la suya) y quedarse con sus mensajes;
   * con las credenciales de la plataforma como respaldo, ni siquiera necesitaba unas propias.
   *
   * La prueba es `GET /debug_token`, que introspecciona el token autenticando con el app
   * access token (`<appId>|<appSecret>`). Responde tres cosas en una sola llamada: que el
   * token sigue vivo, de qué tipo es (`PAGE`, `USER`, `SYSTEM_USER`…) y, si es de página,
   * de CUÁL (`profile_id`). Que el app access token autentique es ya la prueba de que el
   * App Secret es el de la app que emitió el token.
   *
   * El `appId` que hace falta para armarlo no se pide ni se guarda: sale del propio token
   * con `GET /app` (ver `resolveAppId`). Con el Page Access Token y el App Secret basta.
   *
   * Lo que no venga en `input` se toma de `current` (la config guardada): así se puede rotar
   * una sola credencial y aun así verificar el par completo.
   *
   * @throws BadRequestException con un mensaje que se puede mostrar tal cual en el formulario.
   */
  async assertCredentialsOwnPage(
    input: { pageId: string; pageAccessToken?: string; appSecret?: string },
    current?: Pick<MessengerConfig, 'pageAccessToken' | 'appSecret'>,
  ): Promise<void> {
    // Los valores guardados también se recortan: `createRecord` llegó a persistir sin hacerlo
    // y un token con un salto de línea al final viaja como `%0A` y Meta lo rechaza entero.
    const pageAccessToken = (
      input.pageAccessToken?.trim() ||
      (current?.pageAccessToken ? await this.kmsService.decrypt(current.pageAccessToken) : '')
    ).trim();
    const appSecret = (
      input.appSecret?.trim() ||
      (current?.appSecret ? await this.kmsService.decrypt(current.appSecret) : '')
    ).trim();

    if (!pageAccessToken || !appSecret) {
      throw new BadRequestException(
        'El Page Access Token y el App Secret de tu app de Meta son obligatorios',
      );
    }

    const appId = await this.resolveAppId(pageAccessToken);
    const token = await this.debugToken(pageAccessToken, appId, appSecret);

    if (token.is_valid === false) {
      throw new BadRequestException(
        `Meta rechazó el Page Access Token: ${
          token.error?.message ?? 'ya no es válido, genéralo otra vez en tu app de Meta'
        }`,
      );
    }

    // El caso que más se da: se pega el token de usuario que el Graph API Explorer enseña
    // por defecto, o el de un system user de Business Manager. Los dos son válidos y los dos
    // pueden administrar la página, pero el que la Send API necesita es el de la página.
    if (token.type !== 'PAGE') {
      throw new BadRequestException(
        `Ese token es de tipo ${token.type ?? 'desconocido'}, no de página. En tu app de Meta, ` +
          `en Messenger → Configuración → Tokens de acceso, genera el token de la página ` +
          `${input.pageId} y pega ese.`,
      );
    }

    if (token.profile_id !== input.pageId) {
      throw new BadRequestException(
        `El Page Access Token es de la página ${
          token.profile_id ?? 'desconocida'
        }, no de la ${input.pageId}`,
      );
    }

    const scopes = token.scopes ?? [];

    // Lo que sigue no bloquea: son avisos sobre credenciales que Meta da por buenas hoy pero
    // dejan de servir después, y el motivo de esta reescritura es dejar de rechazar de más.
    if (scopes.length > 0 && !scopes.includes('pages_messaging')) {
      this.logger.warn(
        `Messenger: el token de la página ${input.pageId} no trae el permiso pages_messaging ` +
          `(scopes: ${scopes.join(', ')}); no podrá responder por la Send API`,
      );
    }
    if (token.expires_at) {
      this.logger.warn(
        `Messenger: el token de la página ${input.pageId} caduca el ` +
          `${new Date(token.expires_at * 1000).toISOString()}; genera uno permanente o el canal ` +
          `dejará de responder`,
      );
    }
  }

  /**
   * App de Meta que emitió un token.
   *
   * `GET /app` devuelve la app asociada al propio access token, que es justo la que hace
   * falta para armar el app access token de `/debug_token`. Derivarla cuesta un viaje más
   * por verificación, pero evita pedirle al usuario un dato que ya está en el token.
   */
  private async resolveAppId(pageAccessToken: string): Promise<string> {
    let appId: string | undefined;
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<{ id?: string }>(`${GRAPH_API_BASE}/app`, {
          params: { fields: 'id', access_token: pageAccessToken },
        }),
      );
      appId = data?.id;
    } catch (error) {
      // El error de axios no se loguea entero: la URL lleva el token en claro. El cuerpo de
      // la respuesta de Meta sí, que es donde viene el motivo y no trae credenciales.
      this.logger.error(`Messenger: GET /app rechazó el token: ${httpErrorDetail(error)}`);
      throw new BadRequestException(
        `Meta no reconoció el Page Access Token${this.metaReason(error)}`,
      );
    }

    if (!appId) {
      throw new BadRequestException(
        'Meta no dijo qué app emitió el Page Access Token; vuelve a generarlo en tu app de Meta',
      );
    }

    return appId;
  }

  /** Introspección del token contra `/debug_token`, autenticando con el app access token. */
  private async debugToken(
    inputToken: string,
    appId: string,
    appSecret: string,
  ): Promise<DebugTokenData> {
    let data: DebugTokenData | undefined;
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ data?: DebugTokenData }>(`${GRAPH_API_BASE}/debug_token`, {
          params: { input_token: inputToken, access_token: `${appId}|${appSecret}` },
        }),
      );
      data = response.data?.data;
    } catch (error) {
      this.logger.error(
        `Messenger: /debug_token falló para la app ${appId}: ${httpErrorDetail(error)}`,
      );
      // Quien autentica esta llamada es el par App ID + App Secret, así que un rechazo aquí
      // es de ellos, no del token que se está revisando.
      throw new BadRequestException(
        `Meta rechazó el App ID ${appId} con ese App Secret${this.metaReason(error)}`,
      );
    }

    if (!data) {
      throw new BadRequestException('Meta respondió a /debug_token sin datos del token');
    }

    return data;
  }

  /** `: <motivo de Meta>` para pegar al final de un mensaje, o cadena vacía si no vino. */
  private metaReason(error: unknown): string {
    if (isAxiosError<{ error?: { message?: string } }>(error)) {
      const message = error.response?.data?.error?.message;
      if (message) return `: ${message}`;
    }
    return '';
  }

  // ─── Config lookup ────────────────────────────────────────────────────

  async getMessengerConfigById(id: string): Promise<MessengerConfig | null> {
    try {
      return await this.prismaService.messengerConfig.findUnique({ where: { id } });
    } catch (error) {
      this.logger.error('Error fetching Messenger config by ID:', error);
      return null;
    }
  }

  async getMessengerConfigByPageId(pageId: string): Promise<MessengerConfig | null> {
    try {
      return await this.prismaService.messengerConfig.findFirst({
        where: { pageId, deletedAt: null },
      });
    } catch (error) {
      this.logger.error('Error fetching Messenger config by page id:', error);
      return null;
    }
  }

  // ─── Config CRUD ──────────────────────────────────────────────────────

  /**
   * Da de alta una página. No genera ningún secreto: a diferencia de WhatsApp, aquí
   * las dos credenciales las emite Meta —el token de página y el app secret— y la URL
   * del webhook se configura en el panel de la app, no se deriva de la fila.
   *
   * Las credenciales se recortan antes de cifrarse, igual que en `updateConfig`: se pegan
   * a mano desde el panel de Meta y un salto de línea al final sobrevive al cifrado, viaja
   * después como `%0A` en la query y hace que Meta rechace el token sin decir por qué.
   */
  async createRecord(
    organizationId: string,
    workflowId: string,
    pageId: string,
    pageName?: string,
    pageAccessToken?: string,
    appSecret?: string,
    description?: string,
  ): Promise<MessengerConfig | null> {
    try {
      const trimmedToken = pageAccessToken?.trim();
      const trimmedSecret = appSecret?.trim();

      return await this.prismaService.messengerConfig.create({
        data: {
          provider: 'meta',
          organizationId,
          pageId,
          pageName,
          description,
          pageAccessToken: trimmedToken ? await this.kmsService.encrypt(trimmedToken) : undefined,
          appSecret: trimmedSecret ? await this.kmsService.encrypt(trimmedSecret) : undefined,
          defaultWorkflowId: workflowId,
          isActive: true,
        },
      });
    } catch (error) {
      this.logger.error('Error creating Messenger config:', error);
      return null;
    }
  }

  async deleteRecord(configId: string): Promise<boolean> {
    try {
      await this.prismaService.messengerConfig.delete({ where: { id: configId } });
      return true;
    } catch (error) {
      this.logger.error('Error deleting Messenger config record:', error);
      return false;
    }
  }

  async getConfigsByOrganizationAndWorkflow(
    organizationId: string,
    workflowId: string,
  ): Promise<MessengerConfig[]> {
    try {
      return await this.prismaService.messengerConfig.findMany({
        where: { organizationId, defaultWorkflowId: workflowId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error('Error fetching Messenger configs by organization and workflow:', error);
      return [];
    }
  }

  /**
   * Edita una página desde la pantalla de configuración del canal.
   *
   * Solo se escribe lo que llegó: un campo ausente se queda como estaba. Para las dos
   * credenciales, además, una cadena vacía cuenta como ausente —el formulario las
   * muestra en blanco porque el backend nunca las devuelve, y guardar sin tocarlas no
   * puede borrar lo que ya funciona—. La descripción sí se puede vaciar: es texto
   * interno y "sin nota" es un estado legítimo.
   *
   * `pageId` se puede actualizar porque es la llave con la que el webhook entrante
   * resuelve la config. Se trimea antes de guardar para evitar que Meta envíe un
   * valor con espacios extra que no casará con los eventos reales.
   */
  async updateConfig(
    configId: string,
    fields: {
      pageId?: string;
      pageName?: string;
      description?: string;
      appSecret?: string;
      pageAccessToken?: string;
    },
  ): Promise<boolean> {
    try {
      const data: {
        pageId?: string;
        pageName?: string;
        description?: string | null;
        appSecret?: string;
        pageAccessToken?: string;
      } = {};

      const pageId = fields.pageId?.trim();
      if (pageId) data.pageId = pageId;

      const pageName = fields.pageName?.trim();
      if (pageName) data.pageName = pageName;

      if (fields.description !== undefined) {
        const description = fields.description.trim();
        data.description = description || null;
      }

      const appSecret = fields.appSecret?.trim();
      if (appSecret) data.appSecret = await this.kmsService.encrypt(appSecret);

      const pageAccessToken = fields.pageAccessToken?.trim();
      if (pageAccessToken) {
        data.pageAccessToken = await this.kmsService.encrypt(pageAccessToken);
      }

      if (Object.keys(data).length === 0) return true;

      await this.prismaService.messengerConfig.update({ where: { id: configId }, data });
      return true;
    } catch (error) {
      this.logger.error('Error updating Messenger config:', error);
      return false;
    }
  }

  async updateIsActive(configId: string, isActive: boolean): Promise<boolean> {
    try {
      await this.prismaService.messengerConfig.update({
        where: { id: configId },
        data: { isActive },
      });
      return true;
    } catch (error) {
      this.logger.error('Error updating Messenger config isActive status:', error);
      return false;
    }
  }

  async updateConnectionStatus(
    configId: string,
    connectionStatus: MessengerConnectionStatus,
  ): Promise<boolean> {
    try {
      await this.prismaService.messengerConfig.update({
        where: { id: configId },
        data: {
          connectionStatus,
          lastConnectedAt:
            connectionStatus === MessengerConnectionStatus.CONNECTED ? new Date() : undefined,
        },
      });
      return true;
    } catch (error) {
      this.logger.error('Error updating Messenger config connection status:', error);
      return false;
    }
  }

  /** Rota el token de página. Se guarda cifrado; el valor en claro no se persiste. */
  async updatePageAccessToken(configId: string, pageAccessToken: string): Promise<boolean> {
    try {
      await this.prismaService.messengerConfig.update({
        where: { id: configId },
        data: { pageAccessToken: await this.kmsService.encrypt(pageAccessToken.trim()) },
      });
      return true;
    } catch (error) {
      this.logger.error('Error updating Messenger page access token:', error);
      return false;
    }
  }

  /**
   * Rota el app secret. Se guarda cifrado; el valor en claro no se persiste.
   *
   * Rotarlo en Meta invalida el anterior al instante, así que entre el reset allá y
   * este PATCH las firmas no validan y los webhooks devuelven 401. Meta reintenta, de
   * modo que la ventana se traduce en retraso, no en mensajes perdidos.
   */
  async updateAppSecret(configId: string, appSecret: string): Promise<boolean> {
    try {
      await this.prismaService.messengerConfig.update({
        where: { id: configId },
        data: { appSecret: await this.kmsService.encrypt(appSecret.trim()) },
      });
      return true;
    } catch (error) {
      this.logger.error('Error updating Messenger app secret:', error);
      return false;
    }
  }

  // ─── Webhook verification ─────────────────────────────────────────────

  /**
   * Resuelve el challenge de suscripción del webhook (GET).
   *
   * Meta lo llama al dar de alta el endpoint y cada vez que se reconfigura. La
   * comparación es en tiempo constante para no filtrar el token por temporización.
   */
  verifySubscription(mode: string, token: string): boolean {
    if (!this.verifyToken) {
      this.logger.error('MESSENGER_VERIFY_TOKEN no está configurado');
      return false;
    }

    if (mode !== 'subscribe' || !token) {
      return false;
    }

    return this.safeEquals(token, this.verifyToken);
  }

  /**
   * Verifica la firma HMAC de un webhook de Messenger.
   *
   * El header viene como `sha256=<hmac_hex>` y se firma el cuerpo **crudo** con el
   * app secret. Re-serializar con `JSON.stringify` no sirve: Meta escapa los no-ASCII
   * y el orden de llaves no está garantizado, así que la firma no cuadraría.
   *
   * A diferencia de YCloud no hay timestamp, así que no se puede acotar la frescura;
   * lo que cierra la puerta al replay es la deduplicación por `mid`.
   *
   * El secreto sale de la config de la página, no del entorno: cada cliente puede
   * traer su propia app de Meta. Eso obliga a resolver la config ANTES de validar,
   * es decir, a mirar el `pageId` de un cuerpo todavía sin verificar. Es aceptable
   * porque ese dato solo elige QUÉ LLAVE se usa, nunca da acceso por sí mismo: quien
   * no tenga el secreto de esa página no pasa la comprobación. Y por eso el
   * controlador valida **una página a la vez** en vez de aceptar el lote entero al
   * primer acierto — si no, conocer el secreto de un tenant serviría para colar
   * eventos de otro en el mismo POST.
   *
   * @param payload Cuerpo crudo de la petición.
   * @param signatureHeader Contenido del header `x-hub-signature-256`.
   * @param config Config de la página cuyos eventos se están validando.
   */
  async verifySignature(
    payload: string,
    signatureHeader: string,
    config: MessengerConfig,
  ): Promise<boolean> {
    if (!signatureHeader) return false;

    const [algorithm, signature] = signatureHeader.split('=');
    if (algorithm !== 'sha256' || !signature) return false;

    const secret = await this.resolveAppSecret(config);
    if (!secret) return false;

    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    return this.safeEquals(signature, expectedSignature);
  }

  /**
   * App secret con el que se valida la firma de una página.
   *
   * Se prefiere el guardado en la config (cifrado con KMS, uno por app, que es lo que
   * exige un despliegue multi-tenant). El env es la salida para despliegues de una
   * sola app, donde dar de alta una página no debería obligar a montar KMS.
   *
   * Mismo criterio que `resolvePageAccessToken`, con una diferencia: aquí un fallo al
   * descifrar NO se cae al entorno. Validar la firma de un tenant con el secreto de
   * otro es exactamente lo que esta función existe para impedir, así que ante la duda
   * se devuelve vacío y la verificación falla.
   */
  private async resolveAppSecret(
    config: Pick<MessengerConfig, 'pageId' | 'appSecret'>,
  ): Promise<string> {
    if (config.appSecret) {
      try {
        return await this.kmsService.decrypt(config.appSecret);
      } catch (error) {
        this.logger.error(
          `No se pudo descifrar el app secret de la página ${config.pageId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return '';
      }
    }

    if (!this.fallbackAppSecret) {
      this.logger.error(
        `No hay app secret para la página ${config.pageId}: ni en la config ni en MESSENGER_APP_SECRET`,
      );
    }

    return this.fallbackAppSecret;
  }

  // ─── Outbound messaging ───────────────────────────────────────────────

  /**
   * Envía un texto al usuario. Se sanea a texto plano (Messenger no interpreta
   * Markdown) y se parte en trozos que quepan en el límite de la Send API.
   */
  async sendTextMessage(
    config: Pick<MessengerConfig, 'pageId' | 'pageAccessToken'>,
    recipientId: string,
    message: string,
  ): Promise<void> {
    const sanitized = this.sanitizeOutput(message);

    for (const chunk of this.splitIntoChunks(sanitized, MESSENGER_MAX_TEXT_LENGTH)) {
      await this.callSendApi(config, {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: { text: chunk },
      });
    }
  }

  /**
   * Marca como leído y muestra el indicador de escritura.
   *
   * Es la señal de vida que ve el usuario mientras el agente piensa. No es crítico:
   * si falla se registra y se sigue, porque la respuesta importa más que el aviso.
   */
  async markSeenAndSendTypingIndicator(
    config: Pick<MessengerConfig, 'pageId' | 'pageAccessToken'>,
    recipientId: string,
  ): Promise<void> {
    const results = await Promise.allSettled(
      (['mark_seen', 'typing_on'] as const).map((senderAction) =>
        this.callSendApi(config, { recipient: { id: recipientId }, sender_action: senderAction }),
      ),
    );

    results.forEach((result) => {
      if (result.status === 'rejected') {
        this.logger.warn(`No se pudo marcar como leído en Messenger a ${recipientId}`, {
          error: result.reason?.message,
        });
      }
    });
  }

  /**
   * Token con el que se responde por una página.
   *
   * Se prefiere el guardado en la config (cifrado con KMS, uno por página, que es lo
   * que exige un despliegue multi-tenant). El env es la salida para despliegues de una
   * sola página, donde crear la config no debería obligar a montar KMS.
   */
  private async resolvePageAccessToken(
    config: Pick<MessengerConfig, 'pageId' | 'pageAccessToken'>,
  ): Promise<string> {
    if (config.pageAccessToken) {
      try {
        return await this.kmsService.decrypt(config.pageAccessToken);
      } catch (error) {
        this.logger.error(
          `No se pudo descifrar el token de la página ${config.pageId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return '';
  }

  private async callSendApi(
    config: Pick<MessengerConfig, 'pageId' | 'pageAccessToken'>,
    body: Record<string, unknown>,
  ): Promise<void> {
    const accessToken = await this.resolvePageAccessToken(config);
    // Nada de logs aquí: el token de página va descifrado en esta variable y el body
    // lleva el texto de la conversación. Si la llamada falla, el error de axios ya
    // trae URL y estado, que es lo único que hace falta para diagnosticar.
    await firstValueFrom(
      this.httpService.post(`${GRAPH_API_BASE}/me/messages`, body, {
        params: { access_token: accessToken },
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  // ─── Post-turn actions ────────────────────────────────────────────────

  /**
   * Ejecuta las acciones post-turno DECLARADAS en la config del workflow
   * (workflow.config.post_turn_actions) contra las variables persistidas de la
   * conversación. El Gateway es agnóstico: qué acción, con qué variable, con qué
   * texto y con qué frecuencia lo decide cada workflow en su config.
   *
   * A diferencia de WhatsApp, aquí no hay comportamiento legacy que preservar: un
   * workflow que no declara acciones simplemente no dispara ninguna.
   */
  async handleActionsDerivatedFromMetadata(
    conversationId: string,
    organizationId: string,
    executionMetadata: JsonObject,
    config: Pick<MessengerConfig, 'pageId' | 'pageAccessToken'>,
    recipientId: string,
    workflowId?: string,
  ): Promise<void> {
    const variables = ((executionMetadata ?? {})?.variables ?? {}) as Record<string, unknown>;
    if (Object.keys(variables).length === 0) {
      return;
    }

    let declaredActions: PostTurnAction[] | null = null;
    if (workflowId) {
      try {
        const workflow = await this.prismaService.workflow.findUnique({
          where: { id: workflowId },
          select: { config: true },
        });
        const configured = (workflow?.config as JsonObject | null)?.post_turn_actions;
        if (Array.isArray(configured)) {
          declaredActions = configured as unknown as PostTurnAction[];
        }
      } catch (error) {
        this.logger.error(`post_turn_actions: error cargando workflow ${workflowId}:`, error);
      }
    }

    if (declaredActions === null) {
      return;
    }

    /**
     * El cliente SÍ recibe estos mensajes, así que tienen que quedar en el historial:
     * de lo contrario quien revise la conversación en el dashboard vería menos de lo
     * que realmente se envió. Se marcan en metadata con el id de la acción para poder
     * distinguirlos después de las respuestas del agente.
     */
    const sendAndRecord = async (actionId: string, text: string) => {
      await this.sendTextMessage(config, recipientId, text);
      try {
        await this.conversationsService.addMessage(conversationId, ChatRole.ASSISTANT, text, {
          postTurnAction: actionId,
        });
      } catch (error) {
        // El mensaje ya salió; no registrarlo no debe tumbar el resto de las acciones
        this.logger.error(
          `post_turn_actions: no se pudo registrar el mensaje de '${actionId}': ${(error as Error).message}`,
        );
      }
    };

    // Handlers que este canal (Messenger) ofrece a las acciones declaradas
    const handlers: Record<string, PostTurnActionHandler> = {
      send_drive_folder_media: async (triggerValue, params, actionId) => {
        const urls = Array.isArray(triggerValue) ? triggerValue : toText(triggerValue).split(',');
        const intro = toText(params.intro_message);
        if (intro) {
          await sendAndRecord(actionId, intro);
        }
        for (const url of urls) {
          const normalized = toText(url).trim();
          if (!normalized) continue;
          await this.sendFolderMediaToUser(normalized, config, recipientId);
        }
      },
      send_text_message: async (_triggerValue, params, actionId) => {
        const text = toText(params.text);
        if (text) {
          await sendAndRecord(actionId, text);
        }
      },
    };

    const previousFlags = (executionMetadata?.postTurnActions as Record<string, boolean>) ?? {};

    const updatedFlags = await runPostTurnActions({
      actions: declaredActions,
      variables,
      doneFlags: previousFlags,
      handlers,
      log: (level, message) => this.logger[level](message),
    });

    if (JSON.stringify(updatedFlags) !== JSON.stringify(previousFlags)) {
      await this.conversationsService.update(organizationId, conversationId, {
        metadata: {
          ...executionMetadata,
          postTurnActions: updatedFlags,
        },
      });
    }
  }

  /**
   * Reenvía los archivos de una carpeta pública de Drive por la Send API.
   *
   * Meta descarga el archivo desde la URL que se le pasa, así que tiene que ser
   * accesible sin credenciales. Se envía secuencialmente para no saturar la API y un
   * archivo que falle no detiene a los demás.
   */
  private async sendFolderMediaToUser(
    folderUrl: string,
    config: Pick<MessengerConfig, 'pageId' | 'pageAccessToken'>,
    recipientId: string,
  ): Promise<void> {
    const files = await this.driveService.getFilesFromPublicFolder(folderUrl);

    this.logger.info(`Procesando ${files.length} archivos para el cliente.`);

    for (const file of files) {
      // Messenger no tiene un tipo 'document': los archivos genéricos van como 'file'.
      const attachmentType = file.type === 'video' ? 'video' : 'file';

      if (file.type === 'unknown') {
        this.logger.warn(
          `Archivo ignorado por formato no soportado: ${file.name} (${file.mimeType})`,
        );
        continue;
      }

      try {
        this.logger.info(`Enviando ${attachmentType}: ${file.name}...`);

        await this.callSendApi(config, {
          recipient: { id: recipientId },
          messaging_type: 'RESPONSE',
          message: {
            attachment: {
              type: attachmentType,
              payload: { url: file.downloadUrl, is_reusable: false },
            },
          },
        });

        this.logger.info(`Enviado con éxito: ${file.name}`);

        // Pequeño delay entre envíos para respetar los límites de tasa.
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        // El detalle real del rechazo de Meta viene en la respuesta, no en el message.
        const detail = httpErrorDetail(error);
        this.logger.error(`Error enviando archivo ${file.name}: ${detail}`);
        // Decisión arquitectónica: continuar con el siguiente archivo aunque falle uno
      }
    }
  }

  /**
   * Convierte el Markdown que genera el agente a texto plano.
   *
   * Messenger no interpreta ningún formato: los asteriscos y guiones bajos se ven
   * literales, así que se quitan en lugar de traducirse (a diferencia de WhatsApp,
   * que sí tiene su propio subconjunto).
   */
  sanitizeOutput(text: string): string {
    if (!text) return text;

    return (
      text
        // Bloques de código: se conserva el contenido, se quitan las cercas.
        .replace(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/g, '$1')
        // Títulos (#, ##, ...) → solo el texto.
        .replace(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm, '$1')
        // Líneas horizontales (---, ***, ___) → se eliminan.
        .replace(/^\s*([-*_])\1{2,}\s*$/gm, '')
        // Viñetas de lista (-, *, +) → •.
        .replace(/^(\s*)[-*+]\s+/gm, '$1• ')
        // Imágenes: ![alt](url) → url.
        .replace(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g, '$1')
        // Enlaces: [texto](url) → texto (url).
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
        // Énfasis: **texto**, __texto__, *texto*, _texto_, ~~texto~~ → texto.
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .replace(/~~(.+?)~~/g, '$1')
        // Código en línea: `texto` → texto.
        .replace(/`([^`]+?)`/g, '$1')
        .trim()
    );
  }

  /**
   * Parte un texto en trozos que quepan en el límite de la Send API.
   *
   * Se corta por párrafo, luego por línea y solo en última instancia a lo bruto, para
   * que la respuesta se lea igual de bien repartida en varios globos.
   */
  private splitIntoChunks(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) {
      return text.trim() ? [text] : [];
    }

    const chunks: string[] = [];
    let current = '';

    const flush = () => {
      if (current.trim()) chunks.push(current.trim());
      current = '';
    };

    for (const paragraph of text.split(/\n{2,}/)) {
      for (const line of paragraph.split('\n')) {
        // Una línea sola más larga que el tope: no queda otra que cortarla.
        if (line.length > maxLength) {
          flush();
          for (let i = 0; i < line.length; i += maxLength) {
            chunks.push(line.slice(i, i + maxLength));
          }
          continue;
        }

        if (current.length + line.length + 1 > maxLength) {
          flush();
        }
        current = current ? `${current}\n${line}` : line;
      }

      if (current.length + 1 > maxLength) {
        flush();
      } else if (current) {
        current += '\n';
      }
    }

    flush();
    return chunks;
  }

  /** Comparación en tiempo constante, tolerante a largos distintos. */
  private safeEquals(received: string, expected: string): boolean {
    const receivedBuffer = Buffer.from(received, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');

    // timingSafeEqual exige buffers de igual longitud.
    if (receivedBuffer.length !== expectedBuffer.length) return false;

    return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
  }

  async updateConnectionStatusByPageId(
    pageId: string,
    connectionStatus: MessengerConnectionStatus,
  ): Promise<boolean> {
    try {
      await this.prismaService.messengerConfig.updateMany({
        where: { pageId },
        data: {
          connectionStatus,
          lastConnectedAt:
            connectionStatus === MessengerConnectionStatus.CONNECTED ? new Date() : undefined,
        },
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Error updating Messenger config connection status for pageId ${pageId}:`,
        error,
      );
      return false;
    }
  }

  async updateConnectionErrorByPageId(pageId: string, connectionError: string): Promise<boolean> {
    try {
      await this.prismaService.messengerConfig.updateMany({
        where: { pageId },
        data: { connectionError },
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Error updating Messenger config connection error for pageId ${pageId}:`,
        error,
      );
      return false;
    }
  }
}

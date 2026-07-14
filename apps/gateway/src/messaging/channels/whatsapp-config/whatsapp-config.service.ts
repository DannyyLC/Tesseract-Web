import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { WhatsAppConfig, WhatsAppConnectionStatus, WhatsAppTemplate } from '@tesseract/database';
import * as crypto from 'crypto';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { firstValueFrom } from 'rxjs';
import { Logger } from 'winston';
import { PrismaService } from '@/platform/database/prisma.service';
import { GoogleDriveService } from '@/platform/cloud/google-drive/google-drive.service';
import { JsonObject } from '@prisma/client/runtime/client';
import { WhatsAppInboundEvent } from './dto';
import { ConversationsService } from '@/messaging/conversations/conversations.service';

const YCLOUD_API_BASE = process.env.YCLOUD_API_BASE ?? 'https://api.ycloud.com/v2';

@Injectable()
export class WhatsappConfigService {
  private readonly yCloudApiKey: string = process.env.Y_CLOUD_API_KEY || '';
  constructor(
    private readonly prismaService: PrismaService,
    private readonly httpService: HttpService,
    private readonly driveService: GoogleDriveService,
    private readonly conversationsService: ConversationsService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async getWhatsappConfigById(id: string) {
    try {
      const account = await this.prismaService.whatsAppConfig.findUnique({
        where: {
          id: id,
        },
      });
      return account;
    } catch (error) {
      this.logger.error('Error fetching WhatsApp config by ID:', error);
      return null;
    }
  }

  async getWhatsappConfigByPhoneNumber(phoneNumber: string) {
    try {
      const account = await this.prismaService.whatsAppConfig.findFirst({
        where: {
          phoneNumber: phoneNumber,
        },
      });
      return account;
    } catch (error) {
      this.logger.error('Error fetching WhatsApp config by phone number:', error);
      return null;
    }
  }

  async createRecordAndgenerateWebhookSecret(
    organizationId: string,
    workflowId: string,
    phoneNumber: string,
  ): Promise<WhatsAppConfig | null> {
    try {
      const newRecord = await this.prismaService.whatsAppConfig.create({
        data: {
          provider: 'ycloud',
          organizationId: organizationId,
          phoneNumber: phoneNumber,
          webhookUrl: `${process.env.DOMAIN_BASE_URL}/whatsapp-config/whatsapp-webhook`,
          defaultWorkflowId: workflowId,
          isActive: true,
        },
      });

      return newRecord;
    } catch (error) {
      this.logger.error('Error creating WhatsApp config:', error);
      return null;
    }
  }

  async updatePhoneNumber(configId: string, phoneNumber: string): Promise<void> {
    try {
      await this.prismaService.whatsAppConfig.update({
        where: { id: configId },
        data: { phoneNumber: phoneNumber },
      });
    } catch (error) {
      this.logger.error('Error updating WhatsApp phone number:', error);
    }
  }

  async deleteRecord(configId: string): Promise<boolean> {
    try {
      await this.prismaService.whatsAppConfig.delete({
        where: { id: configId },
      });
      return true;
    } catch (error) {
      this.logger.error('Error deleting WhatsApp config record:', error);
      return false;
    }
  }

  async getConfigsByOrganizationAndWorkflow(
    organizationId: string,
    workflowId: string,
  ): Promise<WhatsAppConfig[]> {
    try {
      const records = await this.prismaService.whatsAppConfig.findMany({
        where: {
          organizationId: organizationId,
          defaultWorkflowId: workflowId,
        },
        orderBy: { createdAt: 'desc' },
      });
      return records;
    } catch (error) {
      this.logger.error('Error fetching WhatsApp configs by organization and workflow:', error);
      return [];
    }
  }

  async updateIsActive(configId: string, isActive: boolean): Promise<boolean> {
    try {
      await this.prismaService.whatsAppConfig.update({
        where: { id: configId },
        data: { isActive: isActive },
      });
      return true;
    } catch (error) {
      this.logger.error('Error updating WhatsApp config isActive status:', error);
      return false;
    }
  }

  async updateConnectionStatus(
    configId: string,
    connectionStatus: WhatsAppConnectionStatus,
  ): Promise<boolean> {
    try {
      await this.prismaService.whatsAppConfig.update({
        where: { id: configId },
        data: { connectionStatus: connectionStatus },
      });
      return true;
    } catch (error) {
      this.logger.error('Error updating WhatsApp config connection status:', error);
      return false;
    }
  }

  async verifySignature(payload: string, signatureHeader: string): Promise<boolean> {
    const secret = process.env.Y_CLOUD_WEBHOOK_SECRET || '';
    const parts = signatureHeader.split(',');
    const timestamp = parts[0].split('=')[1];
    const signature = parts[1].split('=')[1];
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');
    return signature === expectedSignature;
  }

  // ─── Outbound messaging ───────────────────────────────────────────────

  async sendTextMessage(from: string, to: string, message: string): Promise<void> {
    await firstValueFrom(
      this.httpService.post(
        `${YCLOUD_API_BASE}/whatsapp/messages/sendDirectly`,
        {
          from,
          to,
          type: 'text',
          text: { body: await this.sanitizeOutput(message), preview_url: false },
        },
        { headers: { 'X-API-Key': this.yCloudApiKey, 'Content-Type': 'application/json' } },
      ),
    );
  }

  /**
   * Sends a pre-approved WhatsApp template message.
   *
   * @param variables - Map of component type to ordered array of values.
   *   Example: { body: ['Juan', 'mañana a las 10 AM'], header: ['Recordatorio'] }
   *   Each array position corresponds to {{1}}, {{2}}, etc. in the template.
   */
  async sendTemplateMessage(
    from: string,
    to: string,
    templateName: string,
    language: string,
    variables: { body?: string[]; header?: string[]; buttons?: string[] },
  ): Promise<void> {
    const components: object[] = [];

    if (variables.header?.length) {
      components.push({
        type: 'header',
        parameters: variables.header.map((text) => ({ type: 'text', text })),
      });
    }

    if (variables.body?.length) {
      components.push({
        type: 'body',
        parameters: variables.body.map((text) => ({ type: 'text', text })),
      });
    }

    if (variables.buttons?.length) {
      variables.buttons.forEach((payload, index) => {
        components.push({
          type: 'button',
          sub_type: 'quick_reply',
          index,
          parameters: [{ type: 'payload', payload }],
        });
      });
    }

    await firstValueFrom(
      this.httpService.post(
        `${YCLOUD_API_BASE}/whatsapp/messages/sendDirectly`,
        {
          from,
          to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: language, policy: 'deterministic' },
            components,
          },
        },
        { headers: { 'X-API-Key': this.yCloudApiKey, 'Content-Type': 'application/json' } },
      ),
    );
  }

  // ─── Template CRUD ────────────────────────────────────────────────────

  async createTemplate(
    whatsAppConfigId: string,
    data: { name: string; displayName?: string; language?: string; variables?: object },
  ): Promise<WhatsAppTemplate> {
    return this.prismaService.whatsAppTemplate.create({
      data: {
        whatsAppConfigId,
        name: data.name,
        displayName: data.displayName,
        language: data.language ?? 'es_MX',
        variables: data.variables ?? {},
      },
    });
  }

  async listTemplates(whatsAppConfigId: string): Promise<WhatsAppTemplate[]> {
    return this.prismaService.whatsAppTemplate.findMany({
      where: { whatsAppConfigId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTemplate(id: string): Promise<WhatsAppTemplate | null> {
    return this.prismaService.whatsAppTemplate.findUnique({ where: { id } });
  }

  async updateTemplate(
    id: string,
    data: {
      name?: string;
      displayName?: string;
      language?: string;
      variables?: object;
      isActive?: boolean;
    },
  ): Promise<WhatsAppTemplate> {
    return this.prismaService.whatsAppTemplate.update({ where: { id }, data });
  }

  async deleteTemplate(id: string): Promise<boolean> {
    try {
      await this.prismaService.whatsAppTemplate.delete({ where: { id } });
      return true;
    } catch (error) {
      this.logger.error('Error deleting WhatsApp template:', error);
      return false;
    }
  }

  /**
   * Convierte el Markdown que genera el agente al subconjunto de formato que
   * WhatsApp entiende:
   *   *negrita*   _cursiva_   ~tachado~   ```monoespaciado```
   *
   * Las construcciones sin equivalente en WhatsApp (títulos, enlaces, viñetas,
   * citas, líneas horizontales) se degradan a texto plano o a una aproximación
   * visual cercana.
   */
  async sanitizeOutput(text: string): Promise<string> {
    if (!text) return text;

    // Marcadores temporales para no reprocesar segmentos ya resueltos.
    const CODE = String.fromCharCode(0); // sentinela para bloques de código
    const BOLD = String.fromCharCode(1); // sentinela para negrita

    // 1. Aislar bloques de código (WhatsApp soporta ```) para no tocar su contenido.
    const codeBlocks: string[] = [];
    let output = text.replace(/```[\s\S]*?```/g, (match) => {
      codeBlocks.push(match);
      return `${CODE}${codeBlocks.length - 1}${CODE}`;
    });

    output = output
      // Títulos (#, ##, ...) → negrita en su propia línea.
      .replace(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm, `${BOLD}$1${BOLD}`)
      // Líneas horizontales (---, ***, ___) → se eliminan.
      .replace(/^\s*([-*_])\1{2,}\s*$/gm, '')
      // Viñetas de lista (-, *, +) → •.
      .replace(/^(\s*)[-*+]\s+/gm, '$1• ')
      // Negrita: **texto** o __texto__ → marcador (se resuelve a * al final).
      .replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${BOLD}`)
      .replace(/__(.+?)__/g, `${BOLD}$1${BOLD}`)
      // Cursiva Markdown: *texto* → _texto_ (WhatsApp usa _ para cursiva).
      .replace(/\*(.+?)\*/g, '_$1_')
      // Tachado: ~~texto~~ → ~texto~.
      .replace(/~~(.+?)~~/g, '~$1~')
      // Código en línea: `texto` → texto (WhatsApp no soporta backtick simple).
      .replace(/`([^`]+?)`/g, '$1')
      // Imágenes: ![alt](url) → url.
      .replace(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g, '$1')
      // Enlaces: [texto](url) → texto (url).
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)');

    // 2. Resolver marcadores de negrita al formato de WhatsApp.
    output = output.split(BOLD).join('*');

    // 3. Restaurar los bloques de código.
    output = output.replace(
      new RegExp(`${CODE}(\\d+)${CODE}`, 'g'),
      (_, i) => codeBlocks[Number(i)],
    );

    return output;
  }

  async handleActionsDerivatedFromMetadata(conversationId: string, organizationId: string, executionMetadata: JsonObject, whatsappInboundMessagePayload: WhatsAppInboundEvent): Promise<void>  {
    const clientNumber = whatsappInboundMessagePayload.whatsappInboundMessage.from;
    const ownerNumber = whatsappInboundMessagePayload.whatsappInboundMessage.to;
    if(clientNumber === undefined || ownerNumber === undefined) {
      this.logger.error('Client number or owner number is undefined in the WhatsApp inbound message payload.');
      return;
    }

    if (executionMetadata) {
      const variables = ((executionMetadata ?? {}) as JsonObject)?.variables;
      if (variables && Object.keys(variables).length > 0) {
        if ((variables as JsonObject)?.media_url && !(executionMetadata as JsonObject)?.media_url_sent) {
          const mediaUrlValue = (variables as JsonObject)?.media_url;
          const mediaUrls = Array.isArray(mediaUrlValue)
            ? mediaUrlValue
            : typeof mediaUrlValue === 'string' && mediaUrlValue.includes(',')
              ? mediaUrlValue.split(',')
              : [mediaUrlValue];

          var firstTime = true;
          for (const mediaUrl of mediaUrls) {
            if (firstTime) {
              this.sendTextMessage(ownerNumber, clientNumber, 'Te tratare de compartir algúnos archivos que son relevantes en relación a lo mencionado anteriormente.');
              firstTime = false;
            }
            const normalizedMediaUrl = String(mediaUrl).trim();
            if (!normalizedMediaUrl) {
              continue;
            }

            await this.sendFolderMediaToUser(normalizedMediaUrl, ownerNumber, clientNumber);
          }
          this.conversationsService.update(organizationId, conversationId, {
            metadata: {
              ...executionMetadata,
              media_url_sent: true,
            },
          });
        }
      }
    }
  }

  private async sendFolderMediaToUser(folderUrl: string, fromPhoneNumber: string, toPhoneNumber: string) {
    // 1. Obtener todos los archivos clasificados
    const files = await this.driveService.getFilesFromPublicFolder(folderUrl);
    
    this.logger.info(`Procesando ${files.length} archivos para el cliente.`);

    // 2. Recorrer y enviar secuencialmente (evita saturar la API)
    for (const file of files) {
      if (file.type === 'unknown') {
        this.logger.warn(`Archivo ignorado por formato no soportado: ${file.name} (${file.mimeType})`);
        continue;
      }

      try {
        this.logger.info(`Enviando ${file.type}: ${file.name}...`);
        // yCloud usa `link` (no `url`). WhatsApp exige `filename` para documentos.
        const media =
          file.type === 'document'
            ? { link: file.downloadUrl, filename: file.name }
            : { link: file.downloadUrl };

        await firstValueFrom(
          this.httpService.post(
            `${YCLOUD_API_BASE}/whatsapp/messages/sendDirectly`,
            {
              from: fromPhoneNumber,
              to: toPhoneNumber,
              type: file.type,
              [file.type]: media,
            },
            { headers: { 'X-API-Key': this.yCloudApiKey, 'Content-Type': 'application/json' } },
          ),
        );

        this.logger.info(`Enviado con éxito: ${file.name}`);
        
        // Opcional: Pequeño delay de 500ms entre envíos para respetar límites de tasa (rate limiting)
        await new Promise((resolve) => setTimeout(resolve, 500));

      } catch (error: any) {
        // El detalle real del rechazo de yCloud viene en la respuesta, no en el message.
        const detail = error?.response?.data
          ? JSON.stringify(error.response.data)
          : error?.message;
        this.logger.error(`Error enviando archivo ${file.name}: ${detail}`);
        // Decisión arquitectónica: Continuar con el siguiente archivo aunque falle uno
      }
    }
  } 
}

import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { WhatsAppConfig, WhatsAppConnectionStatus, WhatsAppTemplate } from '@tesseract/database';
import * as crypto from 'crypto';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { firstValueFrom } from 'rxjs';
import { Logger } from 'winston';
import { PrismaService } from '@/platform/database/prisma.service';

const YCLOUD_API_BASE = process.env.YCLOUD_API_BASE ?? 'https://api.ycloud.com/v2';

@Injectable()
export class WhatsappConfigService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly httpService: HttpService,
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
    console.log(
      'Verifying signature. Payload:',
      payload,
      'Signature header:',
      signatureHeader,
      'webhook secret:',
      secret,
    );
    const parts = signatureHeader.split(',');
    const timestamp = parts[0].split('=')[1];
    const signature = parts[1].split('=')[1];
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');
    console.log('Expected signature:', expectedSignature);
    return signature === expectedSignature;
  }

  // ─── Outbound messaging ───────────────────────────────────────────────

  async sendTextMessage(apiKey: string, from: string, to: string, message: string): Promise<void> {
    await firstValueFrom(
      this.httpService.post(
        `${YCLOUD_API_BASE}/whatsapp/messages/sendDirectly`,
        {
          from,
          to,
          type: 'text',
          text: { body: message, preview_url: false },
        },
        { headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' } },
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
    apiKey: string,
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
        { headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' } },
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
}

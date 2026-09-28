import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { firstValueFrom } from 'rxjs';
import { Logger } from 'winston';
import { BaseWBTransporter } from './base-wb-transporter';
import { WBFile, WBSender, WBTemplate } from './wb-transporter.interface';

/**
 * Cloud API de Meta directa. No envía "desde un número" sino desde su `phone_number_id`,
 * que se guarda en `WhatsAppConfig.sessionData.phoneNumberId`.
 */
@Injectable()
export class MetaTransporter extends BaseWBTransporter {
  static readonly api_base_url =
    process.env.META_WHATSAPP_API_BASE ?? 'https://graph.facebook.com/v21.0';
  constructor(
    private readonly httpService: HttpService,
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
  ) {
    super(logger);
  }

  async sendTxtMessage(sender: WBSender, to: string, text: string): Promise<void> {
    await this.send(sender, to, { type: 'text', text: { body: text, preview_url: false } });
  }

  async sendTemplate(sender: WBSender, to: string, template: WBTemplate): Promise<void> {
    await this.send(sender, to, {
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language },
        components: this.buildTemplateComponents(template.variables),
      },
    });
  }

  protected async sendFile(sender: WBSender, to: string, file: WBFile): Promise<void> {
    await this.send(sender, to, { type: file.type, [file.type]: this.buildMedia(file) });
  }

  protected async markMessageAsRead(sender: WBSender, messageId: string): Promise<void> {
    const phoneNumberId = this.phoneNumberIdOf(sender);
    const accessToken = this.accessTokenOf(sender);
    if (phoneNumberId === '' || accessToken === '') {
      this.logger.error(`Missing Credentials to markMessageAsRead whatsappConfig ${sender.configId}...`);
      return;
    }

    await firstValueFrom(
      this.httpService.post(
        `${MetaTransporter.api_base_url}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
          typing_indicator: { type: 'text' },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );
  }

  private async send(sender: WBSender, to: string, message: object): Promise<void> {
    const phoneNumberId = this.phoneNumberIdOf(sender);
    const accessToken = this.accessTokenOf(sender);
    if (phoneNumberId === '' || accessToken === '') {
      this.logger.error(`Missing Credentials to send a message whatsappConfig ${sender.configId}...`);
      return;
    }

    await firstValueFrom(
      this.httpService.post(
        `${MetaTransporter.api_base_url}/${phoneNumberId}/messages`,
        { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...message },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );
  }

  private phoneNumberIdOf(sender: WBSender): string {
    const phoneNumberId = (sender.sessionData as { phoneNumberId?: unknown } | null)?.phoneNumberId;
    if (typeof phoneNumberId !== 'string' || !phoneNumberId) {
      this.logger.error(`WhatsAppConfig ${sender.configId} (meta) with phoneNumber ${sender.phoneNumber} without sessionData.phoneNumberId`,);
      return '';
    }
    return phoneNumberId;
  }

  private accessTokenOf(sender: WBSender): string {
    const accessToken = (sender.sessionData as { accessToken?: unknown } | null)?.accessToken;
    if (typeof accessToken !== 'string' || !accessToken) {
      this.logger.error(`WhatsAppConfig ${sender.configId} (meta) with phoneNumber ${sender.phoneNumber} without sessionData.accessToken`,);
      return '';
    }
    return accessToken;
  }
}

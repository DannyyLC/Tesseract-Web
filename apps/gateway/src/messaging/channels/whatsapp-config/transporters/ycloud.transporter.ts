import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { firstValueFrom } from 'rxjs';
import { Logger } from 'winston';
import { BaseWBTransporter } from './base-wb-transporter';
import { WBFile, WBSender, WBTemplate } from './wb-transporter.interface';

@Injectable()
export class YCloudTransporter extends BaseWBTransporter {
  static readonly api_base_url = process.env.YCLOUD_API_BASE ?? 'https://api.ycloud.com/v2';

  private readonly apiKey: string = process.env.Y_CLOUD_API_KEY || '';

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
        language: { code: template.language, policy: 'deterministic' },
        components: this.buildTemplateComponents(template.variables),
      },
    });
  }

  protected async sendFile(sender: WBSender, to: string, file: WBFile): Promise<void> {
    await this.send(sender, to, { type: file.type, [file.type]: this.buildMedia(file) });
  }

  protected async markMessageAsRead(_sender: WBSender, messageId: string): Promise<void> {
    await firstValueFrom(
      this.httpService.post(
        `${YCloudTransporter.api_base_url}/whatsapp/inboundMessages/${messageId}/typingIndicator`,
        {},
        { headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' } },
      ),
    );
  }

  private async send(sender: WBSender, to: string, message: object): Promise<void> {
    await firstValueFrom(
      this.httpService.post(
        `${YCloudTransporter.api_base_url}/whatsapp/messages/sendDirectly`,
        { from: sender.phoneNumber, to, ...message },
        { headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' } },
      ),
    );
  }
}

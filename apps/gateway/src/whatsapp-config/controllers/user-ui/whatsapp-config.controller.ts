import { HttpService } from '@nestjs/axios';
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
  Res,
  UseGuards,
} from '@nestjs/common';
import { WhatsAppConfig, WhatsAppConnectionStatus, WhatsAppTemplate } from '@tesseract/database';
import { TriggerType, ConversationChannel } from '@tesseract/database';
import { ApiResponse, ApiResponseBuilder } from '@tesseract/types';
import { Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { firstValueFrom } from 'rxjs';
import { Logger } from 'winston';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { UserPayload } from '../../../common/types/jwt-payload.type';
import { WhatsappConfigService } from '../../../whatsapp-config/whatsapp-config.service';
import { WorkflowsService } from '../../../workflows/workflows.service';
import {
  CreateConfigDto,
  WhatsAppInboundEvent,
  CreateTemplateDto,
  UpdateTemplateDto,
  SendTemplateDto,
} from '../../dto';

@Controller('whatsapp-config')
export class WhatsappConfigController {
  constructor(
    private readonly httpService: HttpService,
    private readonly whatsappConfigService: WhatsappConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly workflowsService: WorkflowsService,
  ) {}

  // ─── Webhook ──────────────────────────────────────────────────────────

  @Post('whatsapp-webhook')
  async handleWebhook(@Body() body: any, @Res() res: Response, @Headers() headers: any) {
    try {
      const parsedBody = body as WhatsAppInboundEvent;
      const whatsappInboundMessageId = parsedBody.whatsappInboundMessage.id;
      const phoneNumber = parsedBody.whatsappInboundMessage.to || 'unknown';
      const userNumber = parsedBody.whatsappInboundMessage.from || 'unknown';
      const messageType = parsedBody.whatsappInboundMessage.type;
      let txtContent = '';
      let isUnsupportedVideo = false;

      const account = await this.whatsappConfigService.getWhatsappConfigByPhoneNumber(phoneNumber);
      const signatureHeader = headers['ycloud-signature'] || '';
      const isValidSignature = await this.whatsappConfigService.verifySignature(
        JSON.stringify(body),
        signatureHeader,
      );
      this.logger.info(
        `payload: ${JSON.stringify(body)}, signatureHeader: ${signatureHeader}, isValidSignature: ${isValidSignature}`,
      );

      if (!account) {
        this.logger.warn(`No WhatsApp config found for phone number: ${phoneNumber}`);
        return res.status(200).send({ received: true });
      }

      if (!account.isActive) {
        this.logger.warn(
          `Received message for inactive WhatsApp config with phone number: ${phoneNumber}`,
        );
        return res.status(200).send({ received: true });
      }

      if (account.connectionStatus !== WhatsAppConnectionStatus.CONNECTED) {
        this.logger.warn(
          `Received message for WhatsApp config with phone number ${phoneNumber} that is not in CONNECTED status, connecting at first time...`,
        );
        const isConnected = await this.whatsappConfigService.updateConnectionStatus(
          account.id,
          WhatsAppConnectionStatus.CONNECTED,
        );
        if (!isConnected) {
          this.logger.error(
            `Failed to update WhatsApp config connection status to CONNECTED for phone number: ${phoneNumber}`,
          );
          return res.status(200).send({ received: true });
        }
      }

      if (!isValidSignature) {
        this.logger.warn(`Invalid signature for message from ${userNumber} to ${phoneNumber}`);
        return res.status(200).send({ received: true });
      }

      switch (messageType) {
        case 'text':
          txtContent = parsedBody.whatsappInboundMessage.text?.body || '';
          break;
        case 'video':
          isUnsupportedVideo = true;
          break;
      }

      if (account.phoneNumber == null || account.phoneNumber === '') {
        await this.whatsappConfigService.updatePhoneNumber(account.id, phoneNumber);
      }

      const yCloudApiKey = process.env.Y_CLOUD_API_KEY;
      if (yCloudApiKey && account.defaultWorkflowId) {
        if (isUnsupportedVideo) {
          await this.whatsappConfigService.sendTextMessage(
            yCloudApiKey,
            phoneNumber,
            userNumber,
            'Los videos no son compatibles. Por favor envia texto, imagen o audio.',
          );
          return res.status(HttpStatus.OK).send({ received: true });
        }

        await this.markMsgAsReadAndSendTypingIndicator(yCloudApiKey, whatsappInboundMessageId);

        const execution = await this.workflowsService.execute(
          account.organizationId,
          account.defaultWorkflowId,
          { message: txtContent },
          { channel: ConversationChannel.WHATSAPP },
          undefined,
          parsedBody,
          undefined,
          TriggerType.WEBHOOK,
        );

        const result = execution.result as any;
        const messages = result?.messages ?? [];
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
        const assistantContent = lastMessage?.role === 'assistant' ? lastMessage.content : null;

        await this.whatsappConfigService.sendTextMessage(
          yCloudApiKey,
          phoneNumber,
          userNumber,
          assistantContent || 'Received your message, but no response generated, try again later.',
        );
      }

      return res.status(HttpStatus.OK).send({ received: true });
    } catch (error) {
      this.logger.error('Webhook error:', error);
      return res.status(HttpStatus.OK).send({ received: true });
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

    const apiKey = process.env.Y_CLOUD_API_KEY;
    if (!apiKey) {
      apiResponse
        .setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR)
        .setData(false)
        .setMessage('Y_CLOUD_API_KEY is not configured');
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(apiResponse.build());
    }

    await this.whatsappConfigService.sendTemplateMessage(
      apiKey,
      config.phoneNumber,
      body.to,
      template.name,
      template.language,
      body.variables,
    );

    apiResponse.setStatusCode(HttpStatus.OK).setData(true).setMessage('Template message sent');
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  private async markMsgAsReadAndSendTypingIndicator(
    accessToken: string,
    whatsAppInboundMessageId: string,
  ) {
    const url = `https://api.ycloud.com/v2/whatsapp/inboundMessages/${whatsAppInboundMessageId}/typingIndicator`;
    await firstValueFrom(
      this.httpService.post(
        url,
        {},
        {
          headers: { 'X-API-Key': accessToken, 'Content-Type': 'application/json' },
        },
      ),
    );
  }
}

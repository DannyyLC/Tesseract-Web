import { HttpService } from '@nestjs/axios';
import { Body, Controller, Headers, HttpStatus, Inject, Post, Res, UseGuards } from '@nestjs/common';
import { WhatsAppConfig } from '@tesseract/database';
import { TriggerType } from '@tesseract/database';
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
import { CreateConfigDto, WhatsAppInboundEvent } from '../../dto';

@Controller('whatsapp-config')
export class WhatsappConfigController {
  constructor(
    private readonly httpService: HttpService,
    private readonly whatsappConfigService: WhatsappConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly workflowsService: WorkflowsService,
) {}

    @Post("whatsapp-webhook")
    async handleWebhook(@Body() body: any, @Res() res: Response, @Headers() headers: any) {
        try {
            const parsedBody = body as WhatsAppInboundEvent;
            // Extract key data from webhook
            const whatsappInboundMessageId = parsedBody.whatsappInboundMessage.id;
            const phoneNumber = parsedBody.whatsappInboundMessage.to || 'unknown';
            const userNumber = parsedBody.whatsappInboundMessage.from || 'unknown';
            const messageType = parsedBody.whatsappInboundMessage.type;
            let txtContent = "";
            let imgContent = "";
            let audioContent = "";
            let isUnsupportedVideo = false;
            const account = await this.whatsappConfigService.getWhatsappConfigByPhoneNumber(phoneNumber);
            const signatureHeader = headers['ycloud-signature'] || '';
            const isValidSignature = await this.whatsappConfigService.verifySignature(JSON.stringify(body), signatureHeader);
            this.logger.info(`payload: ${JSON.stringify(body)}, signatureHeader: ${signatureHeader}, isValidSignature: ${isValidSignature}`);
            if (!account) {
                this.logger.warn(`No WhatsApp config found for phone number: ${phoneNumber}`);
                return res.status(200).send({ received: true });
            }

            if (!isValidSignature) {
                this.logger.warn(`Invalid signature for message from ${userNumber} to ${phoneNumber}`);
                return res.status(200).send({ received: true });
            }

            switch (messageType) {
                case 'text':
                    this.logger.info(`Received text message from ${userNumber} to ${phoneNumber}: ${parsedBody.whatsappInboundMessage.text?.body}`);
                    txtContent = parsedBody.whatsappInboundMessage.text?.body || '';
                    break;
                case 'image':
                    this.logger.info(`Received image message from ${userNumber} to ${phoneNumber}: ${parsedBody.whatsappInboundMessage.image?.link}`);
                    imgContent = parsedBody.whatsappInboundMessage.image?.link || '';
                    break;
                case 'audio':
                    this.logger.info(`Received audio message from ${userNumber} to ${phoneNumber}`);
                    audioContent = 'Received audio message';
                    break;
                case 'video':
                    this.logger.info(`Received unsupported video message from ${userNumber} to ${phoneNumber}`);
                    isUnsupportedVideo = true;
                    break;
                default:
                    this.logger.info(`Received message of type ${messageType} from ${userNumber} to ${phoneNumber}`);
            }

            if (account.phoneNumber == null || account.phoneNumber == '') {
                await this.whatsappConfigService.updatePhoneNumber(account.id, phoneNumber);
            }
            // Send reply TODO, transform audio and image content to text or handle them in workflow
            const yCloudApiKey = process.env.Y_CLOUD_API_KEY;
            if (yCloudApiKey && account.defaultWorkflowId) {
                if (isUnsupportedVideo) {
                    await this.sendReply(
                        yCloudApiKey,
                        phoneNumber,
                        userNumber,
                        'Los videos no son compatibles. Por favor envia texto, imagen o audio.',
                    );
                    return res.status(HttpStatus.OK).send({ received: true });
                }

                await this.markMsgAsReadAndSendTypingIndicator(yCloudApiKey, whatsappInboundMessageId);
                //await this.sendReply(yCloudApiKey, phoneNumber, userNumber, "Reply from Agent" ); TODO; remove when the testing finishes
                const execution = await this.workflowsService.execute(
                    account.organizationId,
                    account.defaultWorkflowId,
                    { message: txtContent },
                    { channel: 'whatsapp' },
                    undefined,
                    parsedBody,
                    undefined,
                    TriggerType.WEBHOOK,
                );

                const result = execution.result as any;
                const messages = result?.messages ?? [];
                const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
                const assistantContent = lastMessage?.role === 'assistant' ? lastMessage.content : null;
                await this.sendReply(yCloudApiKey, phoneNumber, userNumber, assistantContent || 'Received your message, but no response generated, try again later.');
            }
            return res.status(HttpStatus.OK).send({ received: true });
        } catch (error) {
            this.logger.error('Webhook error:', error);
            return res.status(HttpStatus.OK).send({ received: true }); 
        }
    }

    private async markMsgAsReadAndSendTypingIndicator(accessToken: string, whatsAppInboundMessageId: string) {
        const url = `https://api.ycloud.com/v2/whatsapp/inboundMessages/${whatsAppInboundMessageId}/typingIndicator`;
        await firstValueFrom(
            this.httpService.post(url, {}, {
                headers: {
                    'X-API-Key': `${accessToken}`,
                    'Content-Type': 'application/json'
                }
            })
        );
    }

    private async sendReply(accessToken: string, from: string, to: string, message: string) {
        const url = `https://api.ycloud.com/v2/whatsapp/messages/sendDirectly`;

        const payload = {
            from: from,
            to: to,
            type: "text",
            text: {
                body: message,
                preview_url: false
            }
        };

        await firstValueFrom(
            this.httpService.post(url, payload, {
                headers: {
                    'X-API-Key': `${accessToken}`,
                    'Content-Type': 'application/json'
                }
            })
        );
    }

    @Post("create-config")
    @UseGuards(JwtAuthGuard)
    async createConfig(
        @CurrentUser() currUser: UserPayload,
        @Body() body: CreateConfigDto,
        @Res() res: Response
    ): Promise<Response<ApiResponse<boolean>>> {
        const apiResponse = new ApiResponseBuilder<boolean>();
        const existingConfig = await this.whatsappConfigService.getWhatsappConfigByPhoneNumber(body.phoneNumber);
        if (existingConfig) {
            apiResponse
            .setStatusCode(HttpStatus.BAD_REQUEST)
            .setData(false)
            .setMessage('A WhatsApp config with this phone number already exists');
            return res.status(HttpStatus.BAD_REQUEST).json(apiResponse.build());
        }

        const response = await this.whatsappConfigService.createRecordAndgenerateWebhookSecret(currUser.organizationId, body.workflowId, body.phoneNumber);
        if (response) {
            apiResponse
            .setStatusCode(HttpStatus.CREATED)
            .setData(true)
            .setMessage('WhatsApp config created successfully');
            return res.status(HttpStatus.CREATED).json(apiResponse.build());
        } else {
            apiResponse
            .setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR)
            .setData(false)
            .setMessage('Failed to create WhatsApp config');
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(apiResponse.build());
        }
    }
}

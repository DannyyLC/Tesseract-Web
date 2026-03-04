import { Body, Controller, Get, Param, Post, Query, Res, Headers, Inject, UseGuards, Patch } from '@nestjs/common';
import { Response } from 'express';
import { HttpStatus } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { WhatsappConfigService } from '../../../whatsapp-config/whatsapp-config.service';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserPayload } from '../../../common/types/jwt-payload.type';
import { ApiResponse, ApiResponseBuilder } from '@tesseract/types';
import { WhatsAppConfig } from '@tesseract/database';
import { CreateConfigDto, SetupCredentialDto, UpdateTokenDto} from '../../dto';

@Controller('whatsapp-config')
export class WhatsappConfigController {
  constructor(
    private readonly httpService: HttpService,
    private readonly whatsappConfigService: WhatsappConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
) {}

    @Get("whatsapp-webhook/:id")
    async verifyWebhook(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string, @Res() res: Response, @Param('id') id: string) {
        var verifyToken = await this.whatsappConfigService.getWhatsappConfigById(id);
        this.logger.info(`Verifying webhook for ID: ${id}, Mode: ${mode}, Token: ${token}`);
        if (!verifyToken) {
            this.logger.warn(`Verification failed for ID: ${id} - No config found`);
            return res.status(HttpStatus.FORBIDDEN).json({ error: 'Verification failed' });
        }
        if (mode === 'subscribe' && token === verifyToken.webhookSecret) {
            this.logger.info(`Webhook verified successfully for ID: ${id}`);
            return res.status(HttpStatus.OK).send(challenge);
        }
        this.logger.warn(`Verification failed for ID: ${id} - Invalid token or mode`);
        return res.status(HttpStatus.FORBIDDEN).json({ error: 'Verification failed' });
    }

    @Post("whatsapp-webhook/:id")
    async handleWebhook(@Body() body: any, @Res() res: Response, @Param('id') id: string, @Headers() headers: any) {
        try {
            // Extract key data from webhook
            const phoneNumberId = body.entry[0].changes[0].value.metadata.phone_number_id;
            const phoneNumber = body.entry[0].changes[0].value.metadata.display_phone_number;
            const userNumber = body.entry[0].changes[0].value.messages[0].from;
            const messageId = body.entry[0].changes[0].value.messages[0].id;
            const messageContent = body.entry[0].changes[0].value.messages[0].text?.body || '';

            // Get account credentials (from your DB)
            const account = await this.whatsappConfigService.getWhatsappConfigById(id);
            if (!account) {
                this.logger.warn(`No WhatsApp config found for ID: ${id}`);
                return res.status(200).send('EVENT_RECEIVED');
            }

            if (account.phoneNumber == null || account.phoneNumber == '') {
                await this.whatsappConfigService.updatePhoneNumber(id, phoneNumber);
            }
            // Send reply
            if (account.credentialPath) {
                await this.sendReply(account.credentialPath, phoneNumberId, userNumber, messageId);
                //TODO; Add logic to create conversation and add messages to it.
            }
            return res.status(HttpStatus.OK).send('EVENT_RECEIVED');
        } catch (error) {
            this.logger.error('Webhook error:', error);
            return res.status(HttpStatus.OK).send('EVENT_RECEIVED'); 
        }
    }

    private async sendReply(accessToken: string, phoneNumberId: string, to: string, messageId: string) {
        const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

        // TODO; HERE add logic to call the AI Agent
        const payload = {
            messaging_product: 'whatsapp',
            to: to,
            type: 'text',
            text: {
                body: `Hola! Recibí tu mensaje: "${messageId}"`
            }
        };

        await firstValueFrom(
            this.httpService.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
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
    ): Promise<Response<ApiResponse<WhatsAppConfig | null>>> {
        const apiResponse = new ApiResponseBuilder<WhatsAppConfig | null>();
        const response = await this.whatsappConfigService.createRecordAndgenerateWebhookSecret(currUser.organizationId, body.workflowId);
        if (response) {
            apiResponse
            .setStatusCode(HttpStatus.CREATED)
            .setData(response)
            .setMessage('WhatsApp config created successfully');
            return res.status(HttpStatus.CREATED).json(apiResponse.build());
        } else {
            apiResponse
            .setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR)
            .setData(null)
            .setMessage('Failed to create WhatsApp config');
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(apiResponse.build());
        }
    }

    @Post("setup-credentials")
    @UseGuards(JwtAuthGuard)
    async setupCredentials(
        @CurrentUser() currUser: UserPayload,
        @Body() body: SetupCredentialDto,
        @Res() res: Response
    ): Promise<Response<ApiResponse<boolean>>> {
        const apiResponse = new ApiResponseBuilder<boolean>();
        const result = await this.whatsappConfigService.setupCredentials(body);
        if (result) {
            apiResponse
            .setStatusCode(HttpStatus.OK)
            .setData(true)
            .setMessage('Credentials set up successfully');
            return res.status(HttpStatus.OK).json(apiResponse.build());
        } else {
            apiResponse
            .setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR)
            .setData(false)
            .setMessage('Failed to set up credentials');
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(apiResponse.build());
        }
    }

    @Patch("update-token/:id")
    @UseGuards(JwtAuthGuard)
    async updateToken(
        @Param('id') id: string,
        @Body() body: UpdateTokenDto,
        @Res() res: Response
    ): Promise<Response<ApiResponse<boolean>>> {
        const apiResponse = new ApiResponseBuilder<boolean>();
        const result = await this.whatsappConfigService.updateToken(id, body.token);
        if (result) {
            apiResponse
            .setStatusCode(HttpStatus.OK)
            .setData(true)
            .setMessage('Token updated successfully');
            return res.status(HttpStatus.OK).json(apiResponse.build());
        } else {
            apiResponse
            .setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR)
            .setData(false)
            .setMessage('Failed to update token');
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(apiResponse.build());
        }
    }
}

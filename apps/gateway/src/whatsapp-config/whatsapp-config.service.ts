import { PrismaService } from '../database/prisma.service';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from "crypto";
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { SetupCredentialDto } from './dto';
import { WhatsAppConfig } from '@tesseract/database';
import * as crypto from 'crypto';


@Injectable()
export class WhatsappConfigService {
    constructor(
        private readonly prismaService: PrismaService,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ) {}

    async getWhatsappConfigById(id: string) {
        try {
            const account = await this.prismaService.whatsAppConfig.findUnique({
                where: {
                    id: id
                }
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
                    phoneNumber: phoneNumber
                }
            });
            return account;
        } catch (error) {
            this.logger.error('Error fetching WhatsApp config by phone number:', error);
            return null;
        }
    }

    async createRecordAndgenerateWebhookSecret(
        organizationId: string, workflowId: string, phoneNumber: string
    ): Promise<WhatsAppConfig | null> {
        try {
            const newRecord = await this.prismaService.whatsAppConfig.create({
                data: {
                    provider: 'ycloud',
                    organizationId: organizationId,
                    phoneNumber: phoneNumber,
                    webhookUrl: `${process.env.DOMAIN_BASE_URL}/whatsapp-config/whatsapp-webhook`,
                    workflowId: workflowId,
                }
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
                data: { phoneNumber: phoneNumber }
            });
        } catch (error) {
            this.logger.error('Error updating WhatsApp phone number:', error);
        }
    }

    async verifySignature(payload: string, signatureHeader: string): Promise<boolean> {
        const secret = process.env.Y_CLOUD_WEBHOOK_SECRET || '';
        console.log('Verifying signature. Payload:', payload, 'Signature header:', signatureHeader, 'webhook secret:', secret);
        // Parse the header
        const parts = signatureHeader.split(',');
        const timestamp = parts[0].split('=')[1];
        const signature = parts[1].split('=')[1];

        // Construct signed payload
        const signedPayload = `${timestamp}.${payload}`;

        // Compute expected signature
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(signedPayload)
            .digest('hex');

        console.log('Expected signature:', expectedSignature);

        // Compare signatures (use constant-time comparison in production)
        return signature === expectedSignature;
    }

}

import { PrismaService } from '../database/prisma.service';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from "crypto";
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { SetupCredentialDto } from './dto';
import { WhatsAppConfig } from '@tesseract/database';

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

    async createRecordAndgenerateWebhookSecret(
        organizationId: string, workflowId: string
    ): Promise<WhatsAppConfig | null> {

        try {
            const webhookSecret = randomUUID();
            const record = await this.prismaService.$transaction(async (tx) => {
                const newRecord = await tx.whatsAppConfig.create({
                    data: {
                        webhookSecret: webhookSecret,
                        provider: 'meta',
                        organizationId: organizationId,
                        phoneNumber: '',
                        webhookUrl: '',
                        workflowId: workflowId,
                    }
                });

                const updatedRecord = await tx.whatsAppConfig.update({
                    where: { id: newRecord.id },
                    data: { webhookUrl: `${process.env.DOMAIN_BASE_URL}/whatsapp-config/whatsapp-webhook/${newRecord.id}` }
                });

                return updatedRecord;
            });

            return record;
        } catch (error) {
            this.logger.error('Error creating WhatsApp config:', error);
            return null;
        }
    }

    async setupCredentials(
        payload: SetupCredentialDto
    ): Promise<boolean> {
        try {
            const updatedRecord = await this.prismaService.whatsAppConfig.update({
                where: { id: payload.configId },
                data: { credentialPath: payload.credentialPath }
            });
            return true;
        } catch (error) {
            this.logger.error('Error setting up WhatsApp credentials:', error);
            return false;
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

    async updateToken(configId: string, token: string): Promise<boolean> {
        try {
            await this.prismaService.whatsAppConfig.update({
                where: { id: configId },
                data: { credentialPath: token }
            });
        } catch (error) {
            this.logger.error('Error updating WhatsApp token:', error);
            return false;
        }
        return true;
    }
}

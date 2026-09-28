import { MediaProcessingService } from '@/automation/media-processing/media-processing.service';
import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { WhatsAppProvider } from '../transporters/wb-transporter.interface';
import { MetaPayloadConsumer } from './meta.payload-consumer';
import { IWBPayloadConsumer } from './wb-payload-consumer.interface';
import { YCloudPayloadConsumer } from './ycloud.payload-consumer';
import { WhatsAppConfig } from '@prisma/client';
import { WorkflowsService } from '@/automation/workflows/workflows.service';
import { WhatsappConfigService } from '../whatsapp-config.service';

/**
 * Fábrica de consumers por proveedor. Un consumer guarda el payload que lee, así que no
 * puede ser un singleton: compartido, dos webhooks concurrentes se pisarían el estado.
 */
const CONSUMER_FACTORIES: Record<
  WhatsAppProvider,
  (payload: any, logger: Logger, mediaProcessingService: MediaProcessingService, workflowsService: WorkflowsService,
    whatsappConfigService: WhatsappConfigService
  ) => Promise<IWBPayloadConsumer>
> = {
  ycloud: async (payload, logger, mediaProcessingService, workflowsService, whatsappConfigService) => {
    const instance = new YCloudPayloadConsumer(payload, logger, mediaProcessingService, workflowsService, whatsappConfigService);
    await instance.initAsyncProcesses()
    return instance;
  },
  meta: async (payload, logger, mediaProcessingService, workflowsService, whatsappConfigService) => {
    const instance = new MetaPayloadConsumer(payload, logger, mediaProcessingService, workflowsService, whatsappConfigService);
    await instance.initAsyncProcesses()
    return instance;
  },
};

/** Crea el consumer del proveedor que mandó el webhook, ya ligado a su payload. */
@Injectable()
export class WBPayloadConsumerResolver {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger, 
    private readonly mediaProcessingService: MediaProcessingService,
    private readonly workflowsService: WorkflowsService, 
    protected readonly whatsappConfigService: WhatsappConfigService) {}

  async forProvider(provider: string, payload: unknown): Promise<IWBPayloadConsumer> {
    if (!Object.hasOwn(CONSUMER_FACTORIES, provider)) {
      throw new Error(`Proveedor de WhatsApp no soportado: '${provider}'`);
    }
    return await CONSUMER_FACTORIES[provider as WhatsAppProvider](payload, this.logger, this.mediaProcessingService, this.workflowsService, this.whatsappConfigService);
  }
}

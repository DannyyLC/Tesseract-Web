import { Logger } from 'winston';
import { IWBTransporter, WBFile, WBSender, WBTemplate, WBTemplateVariables } from './wb-transporter.interface';

/** Pausa entre archivos para no pegarle a los límites de tasa del proveedor. */
const FILE_SEND_DELAY_MS = 500;

export abstract class BaseWBTransporter implements IWBTransporter {
  constructor(protected readonly logger: Logger) {}

  abstract sendTxtMessage(sender: WBSender, to: string, text: string): Promise<void>;
  abstract sendTemplate(sender: WBSender, to: string, template: WBTemplate): Promise<void>;
  protected abstract sendFile(sender: WBSender, to: string, file: WBFile): Promise<void>;

  async sendFiles(sender: WBSender, to: string, files: WBFile[]): Promise<void> {
    // Secuencial a propósito: evita saturar la API del proveedor.
    for (const file of files) {
      try {
        this.logger.info(`Enviando ${file.type}: ${file.name}...`);
        await this.sendFile(sender, to, file);
        this.logger.info(`Enviado con éxito: ${file.name}`);
        await new Promise((resolve) => setTimeout(resolve, FILE_SEND_DELAY_MS));
      } catch (error: any) {
        // El detalle real del rechazo viene en la respuesta del proveedor, no en el message.
        const detail = error?.response?.data ? JSON.stringify(error.response.data) : error?.message;
        this.logger.error(`Error enviando archivo ${file.name}: ${detail}`);
        // Decisión arquitectónica: continuar con el siguiente archivo aunque falle uno
      }
    }
  }

  /** YCloud replica el formato de componentes de la Cloud API de Meta, así que es común. */
  protected buildTemplateComponents(variables: WBTemplateVariables): object[] {
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

    variables.buttons?.forEach((payload, index) => {
      components.push({
        type: 'button',
        sub_type: 'quick_reply',
        index,
        parameters: [{ type: 'payload', payload }],
      });
    });

    return components;
  }

  /** WhatsApp exige `filename` para documentos; ambos proveedores usan `link` (no `url`). */
  protected buildMedia(file: WBFile): { link: string; filename?: string } {
    return file.type === 'document' ? { link: file.link, filename: file.name } : { link: file.link };
  }
}

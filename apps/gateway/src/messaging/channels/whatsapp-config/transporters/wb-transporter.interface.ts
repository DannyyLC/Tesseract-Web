import { WhatsAppConfig } from '@tesseract/database';

/** Valores válidos de `WhatsAppConfig.provider`: cada uno tiene su transporter. */
export type WhatsAppProvider = 'ycloud' | 'meta';

/**
 * Lo que un transporter necesita del número remitente. `phoneNumber` es el que manda el
 * llamador (no el guardado): YCloud lo usa tal cual como `from`. Meta no envía por número
 * sino por `phoneNumberId`, que vive en `sessionData`.
 */
export interface WBSender {
  configId: WhatsAppConfig['id'];
  phoneNumber: string;
  sessionData: WhatsAppConfig['sessionData'];
}

/**
 * Variables de una plantilla aprobada, por componente. Cada posición del arreglo es un
 * placeholder `{{1}}`, `{{2}}`, ... de la plantilla.
 */
export interface WBTemplateVariables {
  body?: string[];
  header?: string[];
  buttons?: string[];
}

export interface WBTemplate {
  name: string;
  language: string;
  variables: WBTemplateVariables;
}

export interface WBFile {
  type: 'image' | 'video' | 'audio' | 'document';
  name: string;
  link: string;
}

/** Envío saliente de WhatsApp, independiente del proveedor. */
export interface IWBTransporter {
  sendTxtMessage(sender: WBSender, to: string, text: string): Promise<void>;
  sendTemplate(sender: WBSender, to: string, template: WBTemplate): Promise<void>;
  /** Envía los archivos en orden; uno que falle se registra y no detiene a los demás. */
  sendFiles(sender: WBSender, to: string, files: WBFile[]): Promise<void>;
}

/**
 * Lado estático del contrato: TypeScript no deja declarar miembros `static` en una
 * interfaz, así que cada clase se valida contra este tipo en el registro del resolver.
 */
export interface WBTransporterClass {
  readonly api_base_url: string;
  new (...args: any[]): IWBTransporter;
}

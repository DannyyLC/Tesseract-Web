export interface CreateConfigDto {
  /** Un número nace ligado a un workflow. Reasignar/desasignar después sí es opcional. */
  workflowId: string;
  phoneNumber: string;
  displayName?: string;
  description?: string;
}

/**
 * Lo único que la API dice de las credenciales del proveedor. Los secretos (`appSecret`,
 * `accessToken`) nunca salen del gateway: solo se informa si están cargados, para que la UI
 * pueda mostrar "configurado" y dejar que se reemplacen sin verlos.
 */
export interface WhatsAppCredentialsStatus {
  /** No es secreto: es un identificador. `null` si no hay (YCloud, o Meta sin cargar). */
  phoneNumberId: string | null;
  hasAppSecret: boolean;
  hasAccessToken: boolean;
}

export interface WhatsAppConfig {
  id: string;
  phoneNumber: string;
  displayName: string | null;
  description: string | null;
  provider: string;
  credentialPath: string | null;
  webhookSecret: string;
  webhookUrl: string | null;
  connectionStatus: 'PENDING' | 'CONNECTED' | 'ERROR' | 'DISCONNECTED';
  lastConnectedAt: Date | null;
  connectionError: string | null;
  qrCode: string | null;
  qrCodeExpiry: Date | null;
  credentials: WhatsAppCredentialsStatus;
  isActive: boolean;
  defaultWorkflowId: string | null;
  /**
   * Solo importa cuando el workflow tiene más de un número: cuál usa `send_bulk_whatsapp` como
   * remitente para templates si la conversación no es por WhatsApp (API/Messenger no traen un
   * número de destino que lo desambigüe solo, a diferencia del webhook de WhatsApp).
   */
  isDefaultForOutbound: boolean;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  displayName: string | null;
  language: string;
  variables: { body?: string[]; header?: string[]; buttons?: string[] };
  isActive: boolean;
  whatsAppConfigId: string;
  createdAt: Date;
  updatedAt: Date;
}

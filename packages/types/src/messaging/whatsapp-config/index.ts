export interface CreateConfigDto {
  /** Un número nace ligado a un workflow. Reasignar/desasignar después sí es opcional. */
  workflowId: string;
  phoneNumber: string;
  displayName?: string;
  description?: string;
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
  sessionData: unknown;
  isActive: boolean;
  defaultWorkflowId: string | null;
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


export interface CreateConfigDto {
    workflowId: string;
    phoneNumber: string;
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
}

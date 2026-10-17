/**
 * Campos de `WhatsAppConfig.sessionData` que son credenciales y se guardan cifrados con KMS
 * (ver `SecretFieldsCipher`). `phoneNumberId` es solo un identificador: queda en claro.
 */
export const WHATSAPP_SESSION_SECRET_FIELDS = ['appSecret', 'accessToken'] as const;

/** Forma de `sessionData` para el proveedor Meta. */
export interface MetaSessionData {
  phoneNumberId: string;
  appSecret: string;
  accessToken: string;
}

/**
 * Contexto de cifrado (parte del AAD de KMS): ata el ciphertext a la fila. Lo usan quien
 * escribe y todos los que leen, así que vive en un solo lugar.
 */
export function whatsappSessionContext(configId: string): string {
  return `whatsapp-config:${configId}`;
}

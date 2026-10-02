import { WhatsAppConfig } from '@tesseract/database';
import { WhatsAppCredentialsStatus } from '@tesseract/types';

/** Lo que las respuestas HTTP devuelven de un `WhatsAppConfig`: sin `sessionData`. */
export type PublicWhatsAppConfig = Omit<WhatsAppConfig, 'sessionData'> & {
  credentials: WhatsAppCredentialsStatus;
};

/**
 * `sessionData` guarda las credenciales del proveedor (access token y app secret de Meta, cifrados
 * con KMS): ninguna respuesta HTTP debe devolverlas, ni siquiera cifradas. En su lugar va un
 * resumen (`credentials`) que dice qué está cargado sin revelarlo.
 */
export function toPublicConfig(config: WhatsAppConfig): PublicWhatsAppConfig {
  const { sessionData, ...rest } = config;
  const data =
    sessionData && typeof sessionData === 'object' && !Array.isArray(sessionData)
      ? (sessionData as Record<string, unknown>)
      : {};
  const isSet = (v: unknown) => typeof v === 'string' && v.length > 0;

  return {
    ...rest,
    credentials: {
      phoneNumberId: typeof data.phoneNumberId === 'string' && data.phoneNumberId ? data.phoneNumberId : null,
      hasAppSecret: isSet(data.appSecret),
      hasAccessToken: isSet(data.accessToken),
    },
  };
}

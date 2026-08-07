// -----------------------------------------------------------
// 2FA
// -----------------------------------------------------------

/**
 * Payload que el front envía para verificar el segundo factor.
 * Admite tanto un TOTP de 6 dígitos como un código de respaldo (`XXXXX-XXXXX`).
 */
export interface Verify2FACodeDto {
  code2FA: string;
}

/** Respuesta del setup inicial de 2FA — contiene el QR para escanear */
export interface Setup2FAResponse {
  qr: string; // base64 data URL del QR code
  secret: string; // el mismo secreto en base32, para alta manual si el QR no escanea
}

/**
 * Códigos de respaldo recién emitidos. Solo se devuelven una vez —al activar el
 * 2FA o al regenerarlos—: la base de datos únicamente guarda su hash.
 */
export interface BackupCodesResponse {
  backupCodes: string[];
}

/** Respuesta tras verificar el código 2FA correctamente */
export interface Verify2FAResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  rememberMe: boolean;
}

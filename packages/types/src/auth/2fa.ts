// -----------------------------------------------------------
// 2FA
// -----------------------------------------------------------

/** Payload que el front envía para verificar el código 2FA */
export interface Verify2FACodeDto {
  code2FA: string;
}

/** Respuesta del setup inicial de 2FA — contiene el QR para escanear */
export interface Setup2FAResponse {
  qr: string; // base64 data URL del QR code
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
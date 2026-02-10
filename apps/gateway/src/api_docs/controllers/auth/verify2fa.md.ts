export const verify2FASwaggerDesc = `### Verificar Código 2FA
Este endpoint permite verificar el código de autenticación de dos factores (2FA) enviado por el usuario.

#### Reglas de negocio:
1. El usuario debe tener un flujo de 2FA iniciado (token temporal en la cookie).
2. El campo **code2FA** es obligatorio en el body.

> **Nota:** Si el código es válido, se establecen los tokens de sesión.

#### Respuestas
- **200 OK**: 2FA verificado exitosamente.
- **401 Unauthorized**: Código 2FA inválido o expirado.
- **500 Internal Server Error**: Error verificando el código.`

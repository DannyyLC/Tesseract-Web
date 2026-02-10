export const setup2FASwaggerDesc = `### Configuración de 2FA
Este endpoint inicia el proceso de configuración de autenticación de dos factores (2FA) para el usuario autenticado.

#### Reglas de negocio:
1. El usuario debe estar autenticado (token válido).
2. No se requiere body en la petición.

> **Nota:** Devuelve los datos necesarios para configurar 2FA en una app de autenticación.

#### Respuestas
- **200 OK**: Proceso de configuración de 2FA iniciado correctamente.
- **500 Internal Server Error**: Error iniciando la configuración de 2FA.`

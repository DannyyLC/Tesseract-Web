export const refreshSwaggerDesc = `### Refresh Token
Este endpoint permite refrescar el access token usando el refresh token almacenado en la cookie.

#### Reglas de negocio:
1. El refresh token debe estar presente en la cookie.
2. No se requiere body en la petición.

> **Nota:** El refresh token antiguo se invalida (token rotation).

#### Respuestas
- **200 OK**: Tokens actualizados correctamente.
- **401 Unauthorized**: Refresh token inválido o no encontrado.`

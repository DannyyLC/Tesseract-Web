export const logoutSwaggerDesc = `### Logout
Este endpoint cierra la sesión del usuario, invalida el refresh token y limpia las cookies de autenticación.

#### Reglas de negocio:
1. El refresh token debe estar presente en la cookie.
2. No se requiere body en la petición.

> **Nota:** Solo invalida el refresh token específico de esta sesión.

#### Respuestas
- **200 OK**: Sesión cerrada exitosamente.
- **401 Unauthorized**: Token inválido o expirado.`

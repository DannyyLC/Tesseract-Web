export const meSwaggerDesc = `### Obtener Perfil de Usuario
Este endpoint retorna la información del usuario autenticado.

#### Reglas de negocio:
1. El usuario debe estar autenticado (token válido en la cookie).
2. No se requiere body ni parámetros.

> **Nota:** El access token se lee automáticamente desde la cookie.

#### Respuestas
- **200 OK**: Información del usuario autenticado.
- **401 Unauthorized**: Token inválido o expirado.`

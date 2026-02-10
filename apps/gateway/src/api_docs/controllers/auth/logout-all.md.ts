export const logoutAllSwaggerDesc = `### Logout en Todos los Dispositivos
Este endpoint cierra la sesión en todos los dispositivos, invalidando todos los refresh tokens del usuario y limpiando las cookies.

#### Reglas de negocio:
1. El usuario debe estar autenticado.
2. No se requiere body en la petición.

> **Nota:** Invalida todas las sesiones del usuario en todos los dispositivos.

#### Respuestas
- **200 OK**: Sesión cerrada en todos los dispositivos.
- **401 Unauthorized**: Token inválido o expirado.`

export const signupStepOneSwaggerDesc = `### Registro - Paso 1: Enviar Email de Verificación
Este endpoint inicia el proceso de registro enviando un email de verificación al usuario.

#### Reglas de negocio:
1. El campo **email** es obligatorio.
2. El email debe ser válido y no estar registrado previamente.

> **Nota:** Este es el primer paso del registro de usuario.

#### Respuestas
- **200 OK**: Email de verificación enviado exitosamente.
- **500 Internal Server Error**: Error enviando el email o email ya registrado.`

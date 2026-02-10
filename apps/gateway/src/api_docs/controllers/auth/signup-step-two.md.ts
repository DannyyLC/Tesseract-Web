export const signupStepTwoSwaggerDesc = `### Registro - Paso 2: Verificar Código de Email
Este endpoint verifica el código de verificación enviado al email del usuario durante el registro.

#### Reglas de negocio:
1. El campo **code** es obligatorio en el body.
2. El código debe ser válido y no estar expirado.

> **Nota:** Este es el segundo paso del registro de usuario.

#### Respuestas
- **200 OK**: Email verificado exitosamente.
- **400 Bad Request**: Código inválido o expirado.`

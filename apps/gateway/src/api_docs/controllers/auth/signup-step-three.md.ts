export const signupStepThreeSwaggerDesc = `### Registro - Paso 3: Crear Usuario
Este endpoint completa el registro creando el usuario en el sistema.

#### Reglas de negocio:
1. El body debe contener los datos requeridos para el usuario (nombre, email, password, etc.).
2. El email debe haber sido verificado previamente.

> **Nota:** Este es el paso final del registro de usuario.

#### Respuestas
- **201 Created**: Usuario registrado exitosamente.
- **400 Bad Request**: Error en el registro o datos inválidos.`

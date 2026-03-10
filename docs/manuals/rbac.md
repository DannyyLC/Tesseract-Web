---
title: 'Roles y Permisos (RBAC)'
description: 'Sistema de Control de Acceso Basado en Roles de la plataforma.'
---

La seguridad y los límites de acceso dentro de Tesseract/Fractal se manejan a través de un sistema maduro de **RBAC (Role-Based Access Control)**. El objetivo es garantizar que solo los usuarios autorizados de una Organización puedan modificar su configuración crítica.

## 1. Roles por Defecto

En el contexto de una Organización, existen distintos niveles de acceso que determinan lo que un usuario puede hacer:

- **Admin / Propietario:** Tiene acceso global. Puede manejar facturación, invitar miembros y borrar recursos.
- **Editor:** Puede crear, editar y visualizar recursos (como los Workflows), pero no puede modificar la facturación ni invitar usuarios nuevos.
- **Viewer (Lector):** Acceso de solo lectura a métricas y configuraciones, sin capacidad de modificación ni ejecución.

## 2. Matriz de Permisos (Ejemplo)

La aplicación no verifica _Roles_ directamente en el código de negocio, sino **Permisos atómicos**. Esto hace que el sistema sea escalable.

Ejemplo de cómo se protegen los recursos de Workflows en el Backend (Gateway) y Frontend (Web-Client):

| Acción en UI / Endpoint         | Permiso Requerido                              | Quién lo tiene (aprox) |
| :------------------------------ | :--------------------------------------------- | :--------------------- |
| Ver la lista de Workflows       | `workflows:read`                               | Viewer, Editor, Admin  |
| Botón "Nuevo Workflow"          | `workflows:create`                             | Editor, Admin          |
| Botón "Editar" o Endpoint PATCH | `workflows:update`                             | Editor, Admin          |
| Botón "Eliminar" Workflow       | `workflows:delete`                             | Admin                  |
| Botón "Probar Chat"             | `workflows:execute` (o `conversations:create`) | Editor, Admin          |

## 3. Implementación Frontend

En la aplicación de Next.js (Web-Client), no ocultamos páginas a medias, sino elementos específicos.
Si un usuario navega a `/workflows`, la página cargará normalmente porque tiene `workflows:read`. Sin embargo, el botón de "Crear" no se renderizará en el DOM si el contexto de autenticación indica que carece de `workflows:create`.

## 4. Implementación Backend

En NestJS (Gateway), contamos con Guards (ej. `PermissionsGuard` o dependencias dentro del `auth.controller` y `users.service`) que interceptan las peticiones HTTP.

```typescript
// Ejemplo conceptual del decorador para proteger una ruta
@RequirePermissions('workflows:update')
@Patch(':id')
updateWorkflow(...)
```

Si el usuario no tiene los permisos suficientes en la Organización actual, el backend rechaza la petición con un error HTTP 403 (Forbidden).

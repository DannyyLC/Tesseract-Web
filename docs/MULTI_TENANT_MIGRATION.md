# Migración Multi-Tenant: Client → Organization + User

Este documento describe cómo ejecutar la migración del sistema de Client único a un modelo multi-tenant con Organizations, Users y Roles.

## 📋 Resumen de Cambios

### Antes (Modelo Antiguo)
```
Client (mezcla de empresa + usuario + credenciales)
├── workflows
├── apiKeys
├── refreshTokens
└── whatsappConfigs
```

### Después (Modelo Multi-Tenant)
```
Organization (empresa/tenant)
├── Users (empleados con roles: Owner, Admin, Viewer)
│   └── refreshTokens
├── Workflows
├── ApiKeys (credenciales globales de la org)
└── WhatsAppConfigs

Execution
├── workflowId
├── apiKeyId (quién ejecutó desde API)
└── userId (quién ejecutó desde dashboard)
```

## 🎯 Lo Que Se Creó

### 1. **Nuevos Modelos en Prisma**
- `Organization`: La empresa/tenant
- `User`: Empleados con roles (owner/admin/viewer)
- Actualizaciones en `ApiKey`, `Workflow`, `Execution`, etc.

### 2. **Sistema de Roles y Permisos**
📁 `packages/shared-types/src/roles.ts`

Roles disponibles:
- **Owner** 👑: Acceso total, puede invitar usuarios, cambiar plan, gestionar facturación
- **Admin** ⚙️: Puede crear/editar workflows, gestionar API keys, ver analytics
- **Viewer** 👁️: Solo lectura, puede ver workflows y reportes

### 3. **Sistema de Planes**
📁 `packages/shared-types/src/plans.ts`

Planes con límites:
| Plan | Usuarios | Workflows | API Keys | Ejecuciones/día |
|------|----------|-----------|----------|----------------|
| Free | 3 | 5 | 2 | 100 |
| Pro | 10 | 50 | 10 | 10,000 |
| Enterprise | ∞ | ∞ | ∞ | ∞ |

### 4. **Script de Migración de Datos**
📁 `packages/database/prisma/migrations/migrate-to-multitenant.ts`

Migra cada `Client` existente a:
- 1 Organization (hereda plan y límites)
- 1 User con rol Owner (hereda email y password)
- N ApiKeys (migradas a la org)
- N Workflows (migrados a la org)

## 🚀 Pasos para Ejecutar la Migración

### Paso 1: Hacer Backup de la Base de Datos ⚠️

```bash
# PostgreSQL
pg_dump -U postgres -d workflow_automation > backup_antes_migration_$(date +%Y%m%d).sql

# O usando Docker si usas docker-compose
docker-compose exec postgres pg_dump -U postgres workflow_automation > backup.sql
```

### Paso 2: Aplicar la Migración del Schema

```bash
cd packages/database

# Generar y aplicar migración
npx prisma migrate dev --name add_multitenant_support
```

Este comando:
1. Detectará los cambios en `schema.prisma`
2. Creará archivos de migración SQL
3. Aplicará la migración a la base de datos
4. Regenerará el Prisma Client con los nuevos modelos

### Paso 3: Ejecutar el Script de Migración de Datos

```bash
# Compilar el script TypeScript
npx ts-node prisma/migrations/migrate-to-multitenant.ts
```

Esto migrará todos los clientes existentes al nuevo modelo.

**Salida esperada:**
```
🚀 Iniciando migración de Client → Organization + User...

📊 Encontrados 3 clientes para migrar

📦 Migrando cliente: admin@example.com
  🏢 Creando organización: admin-example-com
  👤 Creando usuario Owner: admin@example.com
  🔑 Migrando 2 API keys...
  📋 Migrando 5 workflows...
  ✅ Cliente migrado exitosamente

✅ Migración completada exitosamente!
```

### Paso 4: Verificar la Migración

```bash
# Abrir Prisma Studio para verificar los datos
npx prisma studio
```

Verificar:
- [ ] Todas las organizaciones se crearon correctamente
- [ ] Cada organización tiene al menos 1 usuario Owner
- [ ] Los workflows se migraron correctamente
- [ ] Las API keys se asignaron a las organizaciones

## 📝 Configuración de Roles

Los roles y permisos están centralizados en:
📁 `packages/shared-types/src/roles.ts`

### Ejemplo de uso en Backend:

```typescript
import { UserRole, Permission, hasPermission } from '@workflow-automation/shared-types';

// Verificar si un usuario puede crear workflows
if (hasPermission(user.role, Permission.WORKFLOWS_CREATE)) {
  // Permitir creación
}

// Verificar si puede invitar usuarios (solo Owner)
if (hasPermission(user.role, Permission.USERS_INVITE)) {
  // Permitir invitación
}
```

### Permisos por Rol:

**Owner (👑):**
- ✅ Gestionar organización (actualizar, eliminar, cambiar plan)
- ✅ Invitar/remover usuarios y cambiar roles
- ✅ Crear/editar/eliminar API keys
- ✅ Crear/editar/eliminar workflows
- ✅ Ver y exportar analytics completas

**Admin (⚙️):**
- ✅ Ver información de la organización (read-only)
- ✅ Ver lista de usuarios (sin modificar)
- ✅ Gestionar API keys
- ✅ Gestionar workflows
- ✅ Ver y exportar analytics

**Viewer (👁️):**
- ✅ Ver información de la organización
- ✅ Ver lista de usuarios
- ✅ Ver API keys (sin crear/editar)
- ✅ Ver workflows (sin modificar)
- ✅ Ver analytics (sin exportar)

## 📊 Configuración de Planes

Los planes están centralizados en:
📁 `packages/shared-types/src/plans.ts`

### Ejemplo de uso en Backend:

```typescript
import { PlanType, canAdd, getPlanLimits } from '@workflow-automation/shared-types';

// Verificar si puede crear más workflows
const org = await prisma.organization.findUnique({ where: { id } });
const workflowCount = await prisma.workflow.count({
  where: { organizationId: id }
});

if (!canAdd(org.plan as PlanType, 'maxWorkflows', workflowCount)) {
  throw new ForbiddenException(
    `Has alcanzado el límite de workflows de tu plan ${org.plan}`
  );
}

// Crear workflow...
```

### Validaciones Incluidas:

```typescript
// Validar creación de usuario
const validation = validateUserCreation(org.plan, currentUserCount);
if (!validation.isValid) {
  throw new ForbiddenException(validation.message);
}

// Validar creación de API key
const validation = validateApiKeyCreation(org.plan, currentApiKeyCount);
if (!validation.isValid) {
  throw new ForbiddenException(validation.message);
}
```

## 🔄 Próximos Pasos

Después de ejecutar la migración, necesitarás actualizar el código:

### 1. Guards y Decorators
- [ ] Crear `@CurrentUser` decorator
- [ ] Crear `@CurrentOrganization` decorator
- [ ] Crear `RolesGuard` para validar permisos
- [ ] Actualizar `ApiKeyGuard` para inyectar organizationId

### 2. Auth Service
- [ ] Modificar `auth.service.ts` para usar User en lugar de Client
- [ ] Actualizar `register()` para crear Organization + User Owner
- [ ] Actualizar `login()` para retornar organizationId y role

### 3. Nuevos Módulos
- [ ] Crear `OrganizationsModule` con endpoints CRUD
- [ ] Crear `UsersModule` para gestión de empleados
- [ ] Actualizar `ApiKeysModule` para validar límites de plan
- [ ] Actualizar `WorkflowsModule` para validar permisos de rol

### 4. Analytics
- [ ] Agregar endpoint `/workflows/:id/analytics/by-api-key`
- [ ] Agregar endpoint `/workflows/:id/analytics/by-user`
- [ ] Actualizar `ExecutionService` para registrar apiKeyId y userId

## ⚠️ Notas Importantes

1. **Relaciones Legacy**: El modelo `Client` todavía existe temporalmente con relaciones legacy. Una vez que actualices todo el código, puedes eliminarlo en una migración futura.

2. **API Keys**: Ahora pertenecen a Organizations, no a Users individuales. Cualquier API key puede ejecutar cualquier workflow de la organización (a menos que uses scopes para restringir).

3. **Tracking de Ejecuciones**: Cada `Execution` ahora registra:
   - `apiKeyId`: Si fue ejecutado por API key
   - `userId`: Si fue ejecutado manualmente desde el dashboard
   - Esto permite analytics granulares

4. **Un Solo Owner**: Cada organización debe tener EXACTAMENTE un usuario con rol Owner. El sistema debe validar esto.

## 🆘 Rollback

Si algo sale mal, puedes hacer rollback:

```bash
# Restaurar backup
psql -U postgres -d workflow_automation < backup_antes_migration_YYYYMMDD.sql

# O con Docker
docker-compose exec -T postgres psql -U postgres workflow_automation < backup.sql
```

## 📚 Referencias

- Schema de Prisma: `packages/database/prisma/schema.prisma`
- Roles y Permisos: `packages/shared-types/src/roles.ts`
- Planes: `packages/shared-types/src/plans.ts`
- Script de Migración: `packages/database/prisma/migrations/migrate-to-multitenant.ts`

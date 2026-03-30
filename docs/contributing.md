---
title: 'Guia de Contribucion'
description: 'Flujo de trabajo, convenciones de commits y proceso de Pull Requests para el equipo de Tesseract.'
---

Esta guia explica como trabajamos en el codigo base para mantener un desarrollo ordenado, consistente y facil de revisar.

## 1. Estrategia de Ramas (Gitflow)

Usamos **Gitflow** como modelo de branching. Las dos ramas principales son permanentes:

- **`main`**: Refleja el estado exacto de produccion. Solo recibe merges desde `release/` o `hotfix/`.
- **`develop`**: Rama de integracion. Toda funcionalidad nueva se integra aqui antes de llegar a produccion.

### Tipos de rama de trabajo

| Prefijo    | Sale de   | Se mergea a        | Uso                                                     |
| ---------- | --------- | ------------------ | ------------------------------------------------------- |
| `feature/` | `develop` | `develop`          | Nueva funcionalidad                                     |
| `fix/`     | `develop` | `develop`          | Correccion de bug en desarrollo                         |
| `hotfix/`  | `main`    | `main` + `develop` | Bug critico en produccion                               |
| `release/` | `develop` | `main` + `develop` | Preparacion de una version para produccion              |
| `chore/`   | `develop` | `develop`          | Mantenimiento, refactors, actualizacion de dependencias |
| `docs/`    | `develop` | `develop`          | Solo cambios de documentacion                           |

### Flujo de trabajo diario

```bash
# 1. Arranca siempre desde develop actualizado
git checkout develop
git pull origin develop

# 2. Crea tu rama de trabajo
git checkout -b feature/nombre-descriptivo

# 3. Trabaja, commitea con frecuencia
git add .
git commit -m "feat(modulo): descripcion corta"

# 4. Sube tu rama y abre un PR hacia develop
git push origin feature/nombre-descriptivo
```

**Reglas:**

- Nunca hagas commits directamente en `main` ni en `develop`.
- Manten las ramas cortas y enfocadas: un PR = una funcionalidad o correccion.

---

## 2. Convencion de Commits (Conventional Commits)

Seguimos el estandar **[Conventional Commits](https://www.conventionalcommits.org/)**.

### Formato

```
<tipo>(<alcance opcional>): <descripcion corta en minusculas>
```

### Tipos validos

| Tipo       | Cuando usarlo                                         |
| ---------- | ----------------------------------------------------- |
| `feat`     | Nueva funcionalidad                                   |
| `fix`      | Correccion de bug                                     |
| `docs`     | Solo cambios en documentacion                         |
| `style`    | Formato, espacios (sin cambio de logica)              |
| `refactor` | Refactorizacion sin agregar features ni corregir bugs |
| `test`     | Agregar o corregir tests                              |
| `chore`    | Mantenimiento (dependencias, configs)                 |
| `perf`     | Mejora de rendimiento                                 |

### Ejemplos

```bash
# Correcto
git commit -m "feat(billing): add overage toggle to billing page"
git commit -m "fix(auth): handle expired google oauth token gracefully"
git commit -m "docs(rbac): add missing permissions table"
git commit -m "chore: update prisma to v5.12"

# Incorrecto
git commit -m "cambios"
git commit -m "fix stuff"
git commit -m "WIP"
```

---

## 3. Proceso de Pull Request

### Antes de abrir un PR

```bash
# Tu codigo no tiene errores de lint
npm run lint

# El formato es correcto
npm run format:check

# Los tests pasan
npm run test:all

# El proyecto compila sin errores
npm run build:all
```

Si alguno de estos comandos falla, corrigelo antes de abrir el PR.

### Al crear el PR

1. **Base**: El PR debe apuntar hacia `develop`, nunca a `main` directamente (excepto `hotfix/`).
2. **Titulo**: Sigue la misma convencion de commits: `feat(modulo): descripcion corta`.
3. **Descripcion**: Explica que cambias y por que. Si hay un ticket relacionado, agregalo.
4. **Screenshots**: Si el cambio afecta la UI, incluye capturas de antes y despues.
5. **Aprobacion**: Se requiere al menos **1 revision aprobada** antes de mergear.

### Tamano ideal de un PR

Maximo ~400 lineas de cambio en archivos de logica. PRs grandes son dificiles de revisar. Si la feature es muy grande, dividela en PRs incrementales que se puedan mergear de forma segura.

---

## 4. Revision de Codigo (Code Review)

### Para el autor

- Responde todos los comentarios del revisor, ya sea con un cambio o explicando por que no aplica.
- No mergees tu propio PR sin aprobacion.

### Para el revisor

- Distingue entre comentarios **bloqueantes** (debe corregirse) y **sugerencias** (mejora deseable, no bloquea el merge).
- Intenta revisar dentro de **24 horas** para no bloquear al equipo.
- El objetivo es mejorar el codigo, no criticar a la persona.

---

## 5. Cambios en la Base de Datos (Migraciones)

Si tu cambio involucra modificar el schema de Prisma (`packages/database/prisma/schema.prisma`):

```bash
# 1. Modifica el schema.prisma
# 2. Genera y aplica la migracion en local
npm run prisma:migrate

# 3. Regenera el cliente de Prisma
npm run prisma:generate

# 4. Incluye el archivo de migracion generado en tu PR
git add packages/database/prisma/migrations/
```

> **Importante:** Nunca uses `prisma migrate dev` en produccion. El pipeline de CI/CD usa `prisma migrate deploy`. Ver [deployment.md](setup/deployment.md).

---

## 6. Testing

- Cada nuevo Service de NestJS debe tener al menos un test unitario basico.
- Los tests viven en archivos `*.spec.ts` junto al archivo que prueban.
- Para el microservicio de Python, los tests van en `apps/agents/tests/` usando **Pytest**.

```bash
# Correr todos los tests
npm run test:all

# Correr tests de un workspace especifico
npm run test --workspace=apps/gateway

# Correr un solo archivo de test
npx jest src/billing/billing.service.spec.ts
```

---

## 7. Acceso a Credenciales

Para trabajar localmente necesitaras acceso a algunos servicios externos. Contacta al responsable del equipo para obtenerlos.

| Servicio              | Que necesitas          |
| --------------------- | ---------------------- |
| Stripe (Test Mode)    | API Keys de prueba     |
| Google Cloud Platform | Acceso al proyecto GCP |
| Cloudflare Turnstile  | Site Key y Secret      |
| OpenAI / Anthropic    | API Keys de desarrollo |

Nunca compartas credenciales por chat o correo. Usa el gestor de contrasenas compartido del equipo.

---
title: 'Monorepo y Paquetes'
description: 'Estructura del workspace, comandos y dependencias compartidas.'
---

Tesseract utiliza un enfoque de **Monorepo** gestionado con npm workspaces (y orquestación opcional vía Nx). Esto permite tener múltiples aplicaciones y librerías en un solo repositorio de Git, compartiendo dependencias y facilitando la refactorización a gran escala.

## 1. Estructura de Directorios

La raíz del proyecto se divide en dos grandes carpetas:

### `/apps`

Contiene las aplicaciones finales (los puntos de entrada ejecutables):

- `gateway`: La API Backend principal (NestJS).
- `web-client`: La aplicación Frontend (Next.js).
- `agents`: Scripts o servicios satélites para los motores de IA.

### `/packages`

Contiene las librerías internas compartidas que no se ejecutan por sí solas, sino que son importadas por las aplicaciones en `/apps`:

- `@tesseract/database`: Contiene el esquema de **Prisma** (`schema.prisma`), las migraciones generadas y los scripts de _seed_. Su propósito es centralizar la definición de la base de datos para que múltiples aplicaciones puedan usar el mismo cliente de Prisma generador.
- `@tesseract/types`: Contiene interfaces TypeScript puros, enums, y Data Transfer Objects (DTOs). El Gateway usa esto para responder, y el Web-Client importa los mismos tipos para asegurar que las llamadas HTTP sean _type-safe_.

## 2. Gestión de Scripts (package.json)

El archivo `package.json` en la raíz actúa como orquestador. Permite correr comandos para módulos específicos desde el directorio principal usando el flag `--workspace`.

Comandos clave disponibles desde la raíz:

- `npm run install:all`: Instala dependencias en todos los workspaces.
- `npm run dev:gateway`: Inicia el backend de desarrollo.
- `npm run dev:web`: Inicia el frontend de desarrollo.
- `npm run build:all`: Compila secuencialmente `@tesseract/types`, `@tesseract/database`, el `gateway` y el `web-client`.
- `npm run test:all` / `npm run lint`: Ejecuta pruebas o linters en todos los paquetes.

## 3. Beneficios de esta arquitectura

- **Evita Duplicación:** Si la API devuelve un nuevo campo `status` en el payload de "Suscripción", simplemente se actualiza en `@tesseract/types` y el Frontend arrojará un error de compilación si no está manejando ese nuevo campo correctamente.
- **Gestión Centralizada:** Un solo `node_modules` principal a nivel raíz con las dependencias globales (_hoisting_), lo que ahorra tiempo de instalación y espacio en disco.

## 4. Testing (Jest)

Para garantizar la fiabilidad del código TypeScript/JavaScript, el monorepo utiliza **Jest** como su framework de testing principal (configurado frecuentemente con `@nx/jest` o `ts-jest`).
Al ejecutar comandos como `npm run test:all` desde la raíz, el orquestador corre las suites de pruebas unitarias y de integración distribuidas en los diferentes paquetes y aplicaciones (Gateway, Web-Client, Types) de forma simultánea.

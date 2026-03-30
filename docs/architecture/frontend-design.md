---
title: 'Frontend: Web-Client (Next.js)'
description: 'Arquitectura de la aplicación del lado del cliente, UI y estado.'
---

La interfaz de usuario principal de Tesseract (`apps/web-client`) usa **Next.js** (App Router) y React.

## 1. Estructura de Directorios

El código fuente en `src/` está enfocado en la reusabilidad y separación de conceptos UI:

- **`app/`**: Contiene la definición de rutas usando el paradigma de carpetas de Next.js. Aquí están las páginas por dominio (`/(dashboard)/workflows`, `/(dashboard)/billing`, `/login`). En este nivel se maneja gran parte del SSR (Server-Side Rendering) u obtención inicial de datos ligeros.
- **`components/`**: Interfaz pura. Botones, modales, widgets de chat y layout general. Muchos implementan _Tailwind CSS_ o sistemas de diseño basados en variables inyectadas.
- **`hooks/`**: Lógica de cliente aisaldo. Aquí viven custom hooks vitales como `useInfiniteNotifications` o hooks para abstraer llamadas a la API (fetchers).
- **`providers/`**: Contextos globales de React (Context.Provider). Administra el estado global de la sesión del usuario, el tema (Dark/Light mode) y el contexto de la Organización activa que envuelve a toda la aplicación.
- **`types/`**: Mientras que la mayoría vienen de `@tesseract/types`, en esta carpeta hay interfaces puramente locales de la UI (props complejos, estados de ventanas).
- **`utils/`**: Funciones auxiliares de formateo (moneda, fechas con `date-fns` o similar) y utilerías genéricas.

## 2. Obtención de Datos y Asincronía

El cliente web no confía en `any` para las respuestas. Todas las llamadas asíncronas para obtención y mutación de datos se manejan principalmente con **TanStack Query (React Query)**. Esto proporciona caché automático, reintentos y estados de carga (`isLoading`, `isError`). Todas las respuestas `fetch` se tipan con los DTOs genéricos del monorepo (Ej: `Promise<PaginatedResponse<WorkflowDto>>`).

Para el manejo de listas largas (Workflows, Logs, Chats), la capa de UI consume la estrategia de **Cursor Pagination** dictada por el backend. El hook local mantiene un puntero al `nextCursor` y lo adjunta cuando el usuario hace _scroll_ hacia el final de un contenedor.

## 3. Seguridad Perimetral

Incluso cuando el backend protege celosamente la información, el frontend aplica "Seguridad por Experiencia de Usuario" (UX):
Haciendo uso de los roles definidos en el perfil del usuario, componentes enteros previenen su renderizado o deshabilitan interacciones si hay carencia de permisos para evitar los molestos errores `403` visuales.

Adicionalmente, para proteger flujos públicos o sensibles (como el Login o el Sign Up) contra bots y ataques automatizados, el Web-Client integra **Cloudflare Turnstile** como capa de verificación (CAPTCHA invisible) antes de enviar las peticiones críticas al Gateway.

## 4. Estilos y PWA

- **Global Styles (`styles/`)**: CSS general para variables de color. La app está optimizada para tener una apariencia nativa en móviles.
- **Progressive Web App (PWA)**: Existen configuraciones (ej. metadatos de Next.js en `app/layout.tsx`) para asegurar que el "Status Bar" de los teléfonos (como iOS/Safari) empalme visualmente con el diseño oscuro por defecto de la interfaz, logrando la sensación de ser una App instalada.

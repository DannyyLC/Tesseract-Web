---
title: 'Diseño del Sistema'
description: 'Arquitectura a alto nivel de los módulos de Tesseract/Fractal.'
---

La plataforma Tesseract/Fractal fue diseñada contemplando alta disponibilidad, separación de responsabilidades y facilidad de desarrollo (Developer Experience). El sistema se divide fundamentalmente en dos aplicaciones y dependencias compartidas.

## 1. Componentes Principales

### 🖥️ Frontend (Web-Client)

- **Tecnología:** Next.js (React).
- **Propósito:** Es la plataforma web (dashboard) donde los clientes de la organización inician sesión, gestionan sus Workflows, configuran su facturación y chatean con los Agentes.
- **Styling & UI:** Mantiene una estética moderna, modo oscuro por defecto (incluyendo adaptación de colores en PWA/status bars).

### ⚙️ Backend (Gateway)

- **Tecnología:** NestJS (Node.js/TypeScript).
- **Propósito:** La API REST central que expone todos los endpoints para el Frontend.
- **Responsabilidades:** Autenticación de usuarios, protección de rutas via RBAC, manejo de la lógica de negocio, integración con Stripe (webhooks) y orquestación de llamadas a modelos de IA.

### 📦 Paquetes Compartidos (`@tesseract/types` y otros)

Al trabajar dentro de un monorepo, hay paquetes que son importados por ambas partes:

- **DTOs y Tipos:** Los objetos de transferencia de datos (`PaginatedResponse`, interfaces de creación/actualización) viven en un paquete común. Esto evita la duplicación de código y asegura consistencia total mediante TypeScript; si el contrato del Backend cambia, el Frontend se queja en tiempo de compilación inmediatamente.

## 2. Flujo de Datos Típico

1.  El usuario realiza una acción en el **Web-Client** (ej. "Guardar cambios en el Workflow").
2.  El cliente hace un request autenticado HTTP al **Gateway**.
3.  El **Gateway** intercepta el request mediante _Guards_ para validar el JWT de autenticación y los permisos RBAC dentro del contexto de su Organización actual.
4.  El controlador pasa los datos limpios (usando DTOs re-exportados desde `@tesseract/types`) al Servicio de negocio correspondiente.
5.  El Servicio interactúa con la **Base de Datos** mediante un ORM y devuelve el nuevo estado.
6.  El Web-Client recibe la información actualizada (generalmente empaquetada o tipada) y renderiza la vista en pantalla.

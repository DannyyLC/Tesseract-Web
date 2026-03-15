---
title: 'Workflows y Motor de Ejecución'
description: 'Cómo funciona el motor central de Tesseract para ejecutar flujos conversacionales e IA.'
---

El corazón de Tesseract/Fractal es su motor de Workflows. Un Workflow es esencialmente una cadena de instrucciones o la configuración de un agente de IA que interactúa con el usuario a través de una interfaz de chat.

## 1. Conceptos Core

- **Workflow:** La definición estática de una tarea. Contiene la configuración, los prompts base y los parámetros del agente.
- **Conversación:** Una instancia específica (ejecución) de un Workflow. Cuando un usuario le da a "Probar Chat" o inicia un flujo, se crea una Conversación asociada a ese Workflow.
- **Mensajes / Eventos:** La lista de interacciones dentro de una Conversación.

## 2. Flujo de Ejecución

Cuando un usuario interactúa con un Workflow desde el cliente web:

1.  **Validación de Permisos:** Antes de iniciar, el backend (Gateway) verifica a través de RBAC que el usuario tenga el permiso `workflows:execute` (o `conversations:create`). Dicho permiso varía según su rol en la organización.
2.  **Verificación de Créditos:** El sistema revisa si la organización tiene suficientes créditos restantes en su ciclo de facturación actual o si tiene activada la opción de _Overage_ (ver [Facturación](/manuals/billing)). Si no hay créditos ni Overage, la ejecución se bloquea.
3.  **Procesamiento:** El mensaje se envía al motor, el cual invoca a los modelos de IA correspondientes (ej. OpenAI) inyectando el contexto previo de la conversación y las instrucciones del Workflow.
4.  **Respuesta (Streaming/Síncrona):** El resultado se guarda en la base de datos y se devuelve al cliente para ser renderizado en el widget de chat.

## 3. Consideraciones del Frontend

La interfaz del chat (widget) está diseñada para comportarse de forma fluida, especialmente en dispositivos móviles:

- El área de _input_ se mantiene pegada al teclado nativo en los teléfonos.
- El panel de "Probar Chat" en la edición de Workflows funciona como una previsualización en tiempo real del agente.

## 4. Paginación y Cursos (Cursor Pagination)

Dado que las conversaciones pueden acumular cientos de mensajes o ejecuciones históricas, el backend implementa **Cursor Pagination** (usando `PaginatedResponse`) en lugar de _Offset Pagination_ clásica. Esto garantiza consultas ultra rápidas a la base de datos incluso cuando hay millones de registros, asegurando una experiencia ágil al cargar el historial del chat.

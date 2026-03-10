---
title: 'Motor de Ejecución e Idiomas'
description: 'Deep-dive en el módulo de agentes, ejecuciones e integraciones LLM.'
---

El ecosistema de `apps/gateway/src/executions`, `agents`, y `llm-models` conforma el "Cerebro" de Tesseract/Fractal. Es la máquina de estado que recibe el texto del usuario, lo procesa con Inteligencia Artificial, invoca Herramientas, cobra los créditos correspondientes, y devuelve una respuesta.

## 1. El Ciclo de Vida de una Ejecución

Cuando un usuario manda un mensaje en el Chat de un Workflow:

1.  **Entrada del controlador (`executions.controller.ts`)**: Se recibe un `POST /executions` con el `workflowId` y el mensaje en plano. Validado por su DTO.
2.  **Validación Previa:**
    - Verificamos que el usuario tiene el _Rol/Permiso_ adecuado.
    - Se deduce la Organización y se pregunta la _Billetera de Créditos_ (`CreditTransactions`). ¿Tiene saldo? Si no, ¿tiene _Overage_ habilitado?
3.  **Compilación del Agente:** El Gateway busca en la BD la configuración del Workflow. ¿Qué Prompt base ("System Prompt") tiene? ¿Qué modelo de LLM (ej. gpt-4o, claude-3-opus) se especificó en la interfaz?
4.  **Generación de la Ejecución:** Se guarda un registro en la base de datos de la "Ejecución" con estado `PENDING` o `IN_PROGRESS`.
5.  **Llamada al LLM:** El servicio de _llm-models_ formatea el historial de la conversación, anexa el System Prompt y envía el _payload_ a la API del proveedor respectivo (OpenAI/Anthropic).
6.  **Tool/Function Calling (Agentes Reales):** Si el LLM detecta que necesita usar una Herramienta del módulo `tools/` (ej: "Buscar en la base de datos de empleados" o "Crear una tabla en un PDF"), el Gateway interrumpe la respuesta, corre el código TypeScript de esa herramienta internamente, y le inyecta el resultado de nuevo al LLM para que pueda continuar su hilo de pensamiento de forma autónoma hasta llegar a una conclusión.
7.  **Finalización:**
    - El modelo devuelve un texto final (o un flujo/Stream).
    - Se deduce un crédito (o una fracción) en `CreditTransactions`.
    - Se actualiza la "Ejecución" en BD a `COMPLETED`.
    - El frontend, que posiblemente estaba en estado de "cargando", recibe la respuesta o un evento de Socket y la renderiza.

## 2. Abstracción de Modelos (`llm-models/`)

Tesseract evita el alto acoplamiento (Vendor Lock-in) a un solo modelo como ChatGPT.
Existe una capa de abstracción donde la interfaz expuesta por el módulo `llm-models` permanece constante, independientemente de la librería SDK (`openai`, `@anthropic-ai/sdk`, etc.) que opere por debajo. Si en el futuro surge un nuevo modelo revolucionario de otra empresa empírica, solo basta con agregar un "Adapter" (Adaptador) nuevo, sin tocar la lógica dura de créditos o Base de Datos.

## 3. Streaming (Eventos Server-Side)

Al ser conversaciones dinámicas donde el usuario puede esperar largos segundos por una IA mientras esta escribe "Letra por letra", el motor está preparado para soportar SSE (_Server Sent Events_) o WebSockets. Esto significa que el _Controller_ no siempre espera pasivamente hasta que termina el paso 7, sino que _pipea_ (redirecciona) el _stream_ crudo de bytes devuelto por OpenAI directamente al Frontend, dando la vital percepción de rapidez (Velocidad "First Token").

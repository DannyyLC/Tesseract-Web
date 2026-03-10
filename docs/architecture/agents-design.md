---
title: 'Python Agents (Microservicio)'
description: 'Arquitectura y propósito del servicio satélite de inteligencia artificial en Python.'
---

Mientras que el Gateway (NestJS) maneja la orquestación, facturación y exposición de la API REST, existe un requerimiento crítico en el ecosistema de IA moderna: la manipulación pesada de datos, la ingesta de documentos (RAG) y los frameworks de agentes (como LangChain o LlamaIndex) están profundamente arraigados en el ecosistema **Python**.

Por esta razón, Tesseract incluye un microservicio dedicado en `apps/agents/`.

## 1. Propósito del Servicio

El servicio de `agents` actúa como un satélite "Worker" o microservicio especializado. Sus responsabilidades principales incluyen:

- **Procesamiento de Documentos:** Parseo de PDFs, extracción de texto y generación de _embeddings_ vectoriales para RAG (Retrieval-Augmented Generation).
- **Lógica Compleja de Agentes:** Ejecución de cadenas complejas de IA, herramientas de razonamiento o scripts de _scraping_ que serían ineficientes o carecen de librerías maduras en Node.js.

## 2. Estructura y Dependencias

A diferencia del resto del monorepo que usa `npm`, este módulo es un proyecto nativo de Python gestionado con **Poetry**.

- `pyproject.toml` / `poetry.lock`: Define las dependencias estrictas del entorno virtual (equivalente a `package.json` en Node).
- `src/`: Contiene el código fuente del servidor (típicamente FastAPI o un _worker_ de colas) y la lógica de los agentes.
- `Dockerfile`: Debido a sus dependencias nativas complejas (ej. librerías de C++, _runners_ de machine learning), este servicio se despliega a través de su propia imagen de Docker, manteniéndose agnóstico del Gateway.

## 3. Integración con el Monorepo

¿Cómo vive un proyecto de Python dentro de un monorepo diseñado para TS/JS?
A través de la orquestación de comandos en la raíz mediante Nx (o scripts personalizados en el `package.json` principal).

Por ejemplo, si se desea unificar el _Testing_:

1.  El proyecto de Python de `apps/agents` implementa sus pruebas unitarias en la carpeta `tests/` utilizando **Pytest** y configurado mediante `pytest.ini`.
2.  El `package.json` del monorepo cuenta un script `test:all` que de forma silenciosa llama al binario de `pytest` dentro del directorio de Python, unificando así el reporte de errores en el Pipeline CI/CD.

## 4. Comunicación Gateway ↔ Agents

Dado que son dos runtimes distintos (NestJS vs Python), la comunicación interna se realiza mediante:

1.  **API REST Interna (HTTP):** El Gateway de NestJS le hace peticiones al servidor FastAPI interno para delegar una tarea pesada ("_extrae texto de este PDF en S3 y devuélveme el resumen_").
2.  _(Opcional a futuro)_ **Colas de Mensajes:** Para integraciones asíncronas de larga duración, como indexar miles de documentos.

---
title: 'Catalogo de Tools'
description: 'Referencia de todas las herramientas disponibles: credenciales, configuracion y funciones.'
---

Las tools se conectan al sistema como `TenantTool` y se asignan a agentes dentro de un Workflow. Cada tool tiene un `tool_name` fijo que la identifica en el registry, un conjunto de credenciales requeridas y funciones que el LLM puede invocar.

---

## `google_calendar` — Google Calendar

**Autenticacion:** OAuth 2.0. Las credenciales se obtienen via `/tools/oauth/google/auth-url` y se almacenan automaticamente al completar el callback.

### Credenciales requeridas

| Campo | Descripcion |
|---|---|
| `accessToken` | Token de acceso OAuth (se renueva automaticamente) |
| `refreshToken` | Token de renovacion |
| `clientId` | Client ID de la app OAuth en Google Cloud Console |
| `clientSecret` | Client Secret de la app OAuth |

### Configuracion del tenant (`TenantTool.config`)

| Campo | Tipo | Default | Descripcion |
|---|---|---|---|
| `calendar_id` | string | `"primary"` | ID del calendario. Usar `"primary"` para el calendario principal o el ID especifico de un calendario secundario |
| `timezone` | string | `"UTC"` | Zona horaria para interpretar y mostrar fechas. Ej: `"America/Mexico_City"`, `"America/Bogota"` |

```json
{
  "calendar_id": "primary",
  "timezone": "America/Mexico_City"
}
```

### Funciones disponibles

| Nombre | Descripcion |
|---|---|
| `check_calendar_availability` | Verifica si un slot esta disponible (fecha, hora, duracion) |
| `create_calendar_event` | Crea un nuevo evento (titulo, fecha, hora, asistentes, ubicacion) |
| `list_calendar_events` | Lista eventos en un rango de fechas |
| `update_calendar_event` | Actualiza titulo, horario, asistentes o ubicacion de un evento existente |
| `delete_calendar_event` | Elimina un evento por ID |
| `get_calendar_event_details` | Obtiene todos los detalles de un evento por ID |

### Ejemplo de config en workflow

```json
{
  "agents": {
    "default": {
      "model": "gpt-4o",
      "system_prompt": "Eres un asistente que agenda citas.",
      "tools": ["uuid-tenant-tool-google-calendar"]
    }
  }
}
```

Con `enabled_functions` para restringir funciones disponibles al agente:

```json
{
  "uuid-tenant-tool-google-calendar": {
    "tool_name": "google_calendar",
    "display_name": "Agenda Ventas",
    "enabled_functions": ["check_calendar_availability", "create_calendar_event"]
  }
}
```

---

## `calculator` — Calculadora

**Autenticacion:** Ninguna. No requiere credenciales ni configuracion.

Esta tool no es un servidor MCP — se ejecuta directamente en Python con un evaluador de expresiones matematicas seguro (sin `eval` nativo).

### Credenciales requeridas

Ninguna.

### Configuracion del tenant

Ninguna.

### Funciones disponibles

| Nombre | Descripcion | Ejemplo |
|---|---|---|
| `calculator` | Evalua expresiones matematicas: `+`, `-`, `*`, `/`, `%`, `**`, parentesis | `"(10 + 5) * 2"` → `30.0` |
| `percentage` | Calcula el porcentaje de un valor | `percentage(2350, 15)` → `352.5` |
| `currency_convert` | Convierte entre monedas (mock) | `100 USD → 1700 MXN` |

> **Nota:** `currency_convert` usa tasas fijas de referencia. Para produccion con tasas reales, se debe integrar con una API de tipo exchangerate-api o fixer.io.

### Ejemplo de config en workflow

```json
{
  "agents": {
    "default": {
      "model": "gpt-4o",
      "system_prompt": "Eres un asistente financiero. Usa la calculadora cuando necesites hacer operaciones numericas.",
      "tools": ["uuid-tenant-tool-calculator"]
    }
  }
}
```

---

## `human_handoff` — Escalacion a Humano

**Autenticacion:** Ninguna. No requiere credenciales ni configuracion.

Permite que el agente senale al Gateway que la conversacion debe ser transferida a un agente humano. El Gateway consume esta senal y activa el modo HITL (Human-In-The-Loop) en la conversacion.

### Credenciales requeridas

Ninguna.

### Configuracion del tenant

Ninguna.

### Funciones disponibles

| Nombre | Descripcion |
|---|---|
| `request_human_handoff` | Solicita escalar la conversacion a un humano, con un motivo breve |

**Payload que genera la tool:**

```json
{
  "requested": true,
  "reason": "El usuario solicita hablar con un representante",
  "source": "request_human_handoff"
}
```

El Gateway detecta este payload en la respuesta del agente y activa la bandera de handoff en la conversacion.

### Ejemplo de config en workflow

```json
{
  "agents": {
    "support": {
      "model": "gpt-4o",
      "system_prompt": "Eres un agente de soporte. Si no puedes resolver el problema en 2 intentos, escala a un humano.",
      "tools": ["uuid-tenant-tool-human-handoff"]
    }
  }
}
```

---

## Como asignar tools a un agente

Las tools se configuran en dos capas:

**1. A nivel de TenantTool** — Conectar la herramienta a la organizacion (via `/tenant-tool/create`).

**2. A nivel de Workflow** — En `config.agents`, cada agente lista los UUIDs de sus `TenantTools`:

```json
{
  "agents": {
    "default": {
      "model": "gpt-4o",
      "system_prompt": "...",
      "tools": ["uuid-1", "uuid-2"]
    },
    "sales": {
      "model": "gpt-4o",
      "system_prompt": "...",
      "tools": ["uuid-3"]
    }
  }
}
```

Cada agente solo tiene acceso a las tools de su propia lista. Si dos agentes en el mismo workflow necesitan la misma tool, ambos deben incluir el mismo UUID.

---

## Multiples instancias de la misma tool

Es posible conectar la misma tool dos veces con configuraciones distintas. Por ejemplo, dos calendarios de Google distintos:

```json
{
  "uuid-calendar-ventas": {
    "tool_name": "google_calendar",
    "display_name": "Calendario Ventas",
    "config": { "calendar_id": "ventas@empresa.com", "timezone": "America/Mexico_City" }
  },
  "uuid-calendar-soporte": {
    "tool_name": "google_calendar",
    "display_name": "Calendario Soporte",
    "config": { "calendar_id": "soporte@empresa.com", "timezone": "America/Bogota" }
  }
}
```

El sistema diferencia las funciones automaticamente agregando un sufijo con el `display_name`:
- `check_calendar_availability_Calendario_Ventas`
- `check_calendar_availability_Calendario_Soporte`

El LLM ve los dos conjuntos de funciones como entidades separadas y puede invocarlas independientemente.

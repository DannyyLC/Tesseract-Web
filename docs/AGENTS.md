# Testing del Servicio de Agents

Guía rápida para ejecutar y crear tests en el servicio de agents.

## Instalación de Dependencias

```bash
cd apps/agents
poetry install --no-root
```

Esto instala todas las dependencias incluyendo las de desarrollo.

## Estructura del Proyecto

```
apps/agents/
├── src/                          # Código fuente
│   ├── main.py                   # Entry point de FastAPI
│   ├── api/                      # Endpoints HTTP
│   │   ├── routes.py             # Endpoint /execute
│   │   └── deps.py               # Request/Response schemas
│   ├── core/                     # Lógica core
│   │   ├── agent_factory.py      # Creación de grafos
│   │   └── context.py            # TenantContext
│   ├── graphs/                   # Grafos de LangGraph
│   │   └── react_agent.py        # Grafo ReAct
│   └── tools/                    # Herramientas
│       ├── calculator.py         # Calculator (built-in)
│       ├── registry.py           # Carga tools según config
│       └── google/               # Tools de Google (Calendar, etc)
│           └── calendar.py
├── tests/                        # Tests
│   ├── conftest.py               # Fixtures compartidos
│   ├── test_calculator.py        # Tests de calculator
│   ├── test_context.py           # Tests de TenantContext
│   ├── test_message_conversion.py# Test de Mensajes y conversaciones
│   └── test_routes.py            # Tests de endpoints HTTP
├── pyproject.toml                # Dependencias
└── pytest.ini                    # Configuración de pytest
```

## Dónde Agregar Nuevas Tools

### Tools Built-in (sin MCP)

Para herramientas simples como calculator:

1. Crear archivo en `src/tools/` (ej: `weather.py`)
2. Implementar funciones con decorador `@tool`
3. Crear función `load_weather_tools()` que retorne lista de tools
4. Registrar en `src/tools/registry.py`:

```python
# En load_specific_tool()
elif tool_name == "weather":
    from tools.weather import load_weather_tools
    tools = load_weather_tools()
```

### Tools con MCP (Google, HubSpot, etc)

Para herramientas que usan servicios externos:

1. Crear carpeta en `src/tools/` (ej: `src/tools/hubspot/`)
2. Estructura recomendada:
   ```
   tools/hubspot/
   ├── __init__.py
   ├── contacts.py      # Tool de contactos
   ├── deals.py         # Tool de deals
   └── client.py        # Cliente API
   ```
3. Cada archivo debe tener funciones con `@tool`
4. Crear `load_hubspot_tools()` en `__init__.py`
5. Registrar en `registry.py`

**Ejemplo:**

```python
# tools/hubspot/__init__.py
from tools.hubspot.contacts import get_contact, create_contact
from tools.hubspot.deals import get_deal, create_deal

def load_hubspot_tools():
    return [
        get_contact,
        create_contact,
        get_deal,
        create_deal
    ]
```

## Ejecutar Tests

### Todos los tests

```bash
poetry run pytest
```

### Con output detallado

```bash
poetry run pytest -v
```

### Tests específicos

```bash
# Solo tests de calculator
poetry run pytest tests/test_calculator.py

# Un test específico
poetry run pytest tests/test_calculator.py::TestCalculator::test_basic_addition
```

### Con cobertura de código

```bash
poetry run pytest --cov=src --cov-report=html
```

Después abre `htmlcov/index.html` en tu navegador para ver el reporte detallado.

### Tests en modo watch (durante desarrollo)

```bash
poetry run pytest-watch
```

## Crear Nuevos Tests

### 1. Para una nueva tool

Crear `tests/test_<nombre_tool>.py`:

```python
import pytest
from tools.weather import get_weather

class TestWeather:
    """Tests para weather tool."""

    def test_get_weather_success(self):
        """Prueba obtener clima."""
        result = get_weather.invoke({"city": "Mexico City"})
        assert "temperature" in result.lower()

    def test_get_weather_invalid_city(self):
        """Prueba ciudad inválida."""
        result = get_weather.invoke({"city": "InvalidCity123"})
        assert "error" in result.lower()
```

### 2. Para endpoints HTTP

Agregar tests en `tests/test_routes.py`:

```python
def test_my_new_endpoint(client):
    """Prueba nuevo endpoint."""
    response = client.get("/api/v1/agents/new-endpoint")
    assert response.status_code == 200
```

### 3. Usar fixtures

Las fixtures están en `conftest.py`:

- `client` - Cliente FastAPI para tests
- `sample_request` - Request de ejemplo completo
- `mock_env_vars` - Variables de entorno mockeadas
- `mock_llm_response` - Respuesta del LLM mockeada

## Tips

1. **Usa mocks** para llamadas externas (APIs, LLMs)
2. **Agrupa tests** por clase (`TestCalculator`, `TestWeather`)
3. **Nombres descriptivos** - `test_get_weather_with_invalid_city`
4. **Un assert por test** cuando sea posible
5. **Fixtures** para código reutilizable

## Cobertura Actual

Ejecuta `poetry run pytest --cov=src` para ver el estado actual de cobertura.

Meta recomendada: **80%+ de cobertura** en código crítico (core, tools, api).

"""
Tool Registry - Carga tools y LLMs según configuración del TenantContext.

RESPONSABILIDADES:
1. get_llm() - Inicializa el LLM correcto (OpenAI, Anthropic, etc)
2. load_tools() - Carga las tools habilitadas con sus credenciales
3. load_specific_tool() - Inicializa una tool específica (MCP server)

FLUJO DE TOOLS:
    TenantContext
    ├─ enabled_tools: ["hubspot", "google_calendar"]
    ├─ credentials: {"hubspot": {"api_key": "xxx"}, ...}
    └─ tool_configs: {"hubspot": {"portal_id": "123"}, ...}
         ↓
    load_tools(ctx)
         ↓
    Para cada tool en enabled_tools:
      1. Obtener credenciales: ctx.get_tool_credentials(tool_name)
      2. Obtener config: ctx.get_tool_config(tool_name)
      3. Inicializar tool: load_specific_tool(tool_name, creds, config)
         ↓
    Retorna lista de LangChain Tools

FLUJO DE LLM (con LiteLLM):
    TenantContext
    └─ model_configs: {
         "default": {
           "model": "gpt-4o",
           "temperature": 0.7,
           "fallbacks": ["claude-3-5-sonnet-20241022"],
           ...
         }
       }
         ↓
    get_llm(ctx, "default")
         ↓
    LiteLLM maneja TODOS los providers automáticamente
         ↓
    Retorna ChatLiteLLM (funciona con 100+ modelos)
"""

from typing import Any, List
from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool
import logging
import re
import unicodedata

from core.context import TenantContext

# ==========================================
# Logger
# ==========================================
logger = logging.getLogger(__name__)


# ==========================================
# Nombres de tool válidos para el proveedor
# ==========================================
# OpenAI valida `tools[N].function.name` contra ^[a-zA-Z0-9_-]+$ con tope de 64 caracteres, y
# responde 400 cuando no casa. Ese nombre no lo elegimos del todo nosotros: lleva pegado el
# display_name de la instancia, que teclea el cliente en el UI —o que arma el Gateway, como el
# `Datos: <catálogo>` de los datasets, cuyos dos puntos rompen el patrón siempre—. Sanear aquí, en
# la última capa antes de bind_tools, es lo único que no depende de que cada productor de nombres
# se porte bien.
TOOL_NAME_MAX_LENGTH = 64
_INVALID_TOOL_NAME_CHARS = re.compile(r"[^a-zA-Z0-9_-]+")
_UNDERSCORE_RUN = re.compile(r"_{2,}")


def _sanitize_tool_name(name: str) -> str:
    """Deja solo [a-zA-Z0-9_-]. Los acentos caen a su letra base, no a un guion bajo."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return _UNDERSCORE_RUN.sub("_", _INVALID_TOOL_NAME_CHARS.sub("_", ascii_name)).strip("_")


def _normalize_tool_names(tools: List[BaseTool], workflow_id: str) -> List[BaseTool]:
    """
    Deja los nombres válidos para el proveedor y únicos dentro de la lista.

    Corre sobre la lista completa —instancias de tenant y signal tools— porque se construyen por
    caminos distintos y una signal puede chocar con una instancia.

    El desempate no es cosmético: un nombre repetido no da error en ninguna capa. Tanto el
    `tools_by_name` del nodo agent como el ToolNode de LangGraph indexan por nombre en un dict, y
    gana el último. El modelo elegiría la tool correcta y la ejecución caería en la otra, sin
    error y sin log: el agente contesta con datos de la instancia equivocada.

    `metadata["base_name"]` se conserva crudo: es lo que referencian disable_tools_if,
    set_variables_on_tool_call e intercept_tools_in_parallel desde la config.
    """
    seen: set[str] = set()

    for tool in tools:
        metadata = getattr(tool, "metadata", None)
        raw_base = metadata.get("base_name") if isinstance(metadata, dict) else None
        base_name = _sanitize_tool_name(raw_base or tool.name) or "tool"

        original = tool.name
        # Vacío = el display_name era todo caracteres inválidos ("✅"). Cae al nombre base; si eso
        # lo vuelve ambiguo es porque hay otra instancia, y de eso se encarga el desempate.
        candidate = _sanitize_tool_name(original) or base_name

        if len(candidate) > TOOL_NAME_MAX_LENGTH:
            # El nombre base es prefijo del completo, así que recortar por la derecha lo respeta.
            # El fallback cubre el caso degenerado de un base que ya excede el tope por sí solo.
            candidate = (
                candidate[:TOOL_NAME_MAX_LENGTH].rstrip("_") or base_name[:TOOL_NAME_MAX_LENGTH]
            )

        unique = candidate
        attempt = 2

        while unique in seen:
            numbered = f"_{attempt}"
            unique = candidate[: TOOL_NAME_MAX_LENGTH - len(numbered)].rstrip("_") + numbered
            attempt += 1

        if unique != candidate:
            logger.warning(
                f"[{workflow_id}] Tool name collision: '{original}' -> '{unique}'. "
                f"Renombra una de las instancias: el modelo no puede distinguirlas por nombre."
            )
        elif unique != original:
            logger.debug(
                f"[{workflow_id}] Tool name normalized: '{original}' -> '{unique}'"
            )

        tool.name = unique
        seen.add(unique)

    return tools


# ==========================================
# GET LLM - Inicializa el modelo con LiteLLM
# ==========================================
def get_llm(ctx: TenantContext, model_key: str = "default") -> BaseChatModel:
    """
    Inicializa el LLM usando LiteLLM 
    
    LiteLLM detecta el provider automáticamente por el nombre del modelo:
    - "gpt-4o" → OpenAI
    - "claude-3-5-sonnet-20241022" → Anthropic
    - "gemini-pro" → Google
    - "command-r-plus" → Cohere
    - Y 100+ más...
    
    Args:
        ctx: TenantContext con configuración del workflow
        model_key: Qué configuración de modelo usar ("default", "classifier", etc)
    
    Returns:
        ChatLiteLLM inicializado
        
    Raises:
        ValueError: Si la configuración es inválida
        
    Example:
        ctx = TenantContext(
            model_configs={
                "default": {
                    "model": "gpt-4o",
                    "temperature": 0.7,
                    "max_tokens": 1000,
                    "fallbacks": ["claude-3-5-sonnet-20241022"],  # Si OpenAI falla
                    "max_retries": 2
                }
            },
            ...
        )
        
        llm = get_llm(ctx)
        # → ChatLiteLLM que funciona con cualquier modelo
    
    Configuración avanzada (opcional):
        {
            "model": "gpt-4o",
            "temperature": 0.7,
            "max_tokens": 1000,
            
            # Fallbacks si el modelo principal falla
            "fallbacks": ["claude-3-5-sonnet-20241022", "gemini-pro"],
            
            # Reintentos con exponential backoff
            "max_retries": 2,
            
            # Timeout por request
            "timeout": 60,
            
            # API base custom (para proxies)
            "api_base": "https://custom-proxy.com/v1"
        }
    """
    
    # ==========================================
    # 1. Obtener configuración del modelo
    # ==========================================
    model_config = ctx.get_agent_config(model_key)
    
    if not model_config:
        raise ValueError(
            f"No model configuration found for key '{model_key}'. "
            f"Available keys: {list(ctx.agents_config.keys())}"
        )
    
    model_name = model_config.get("model")
    if not model_name:
        raise ValueError(
            f"Model configuration for '{model_key}' missing 'model' field"
        )
    
    # ==========================================
    # 2. Extraer parámetros
    # ==========================================
    # temperature es opcional: None = no especificado → no se envía al proveedor
    # (necesario para modelos reasoning que rechazan temperature != 1).
    temperature = model_config.get("temperature")
    max_tokens = model_config.get("max_tokens")
    fallbacks = model_config.get("fallbacks", [])
    max_retries = model_config.get("max_retries", 2)
    timeout = model_config.get("timeout", 60)
    api_base = model_config.get("api_base")
    # Parámetros extra por-proveedor (p.ej. {"reasoning_effort": "none"}). Se mergean
    # como model_kwargs del LLM. Genérico: no requiere cambios de código por parámetro.
    model_params = model_config.get("model_params") or {}

    logger.info(
        f"[{ctx.workflow_id}] Initializing LLM with LiteLLM: {model_name} "
        f"(temperature={temperature}, fallbacks={len(fallbacks)}, "
        f"model_params={list(model_params.keys()) or None})"
    )
    
    # ==========================================
    # 3. Inicializar con LiteLLM
    # ==========================================
    try:
        from langchain_community.chat_models import ChatLiteLLM
        
        # Construir parámetros
        llm_kwargs = {
            "model": model_name,
            "max_retries": max_retries,
            "request_timeout": timeout,
            "streaming": ctx.streaming,  # Habilitar/deshabilitar streaming
        }

        # temperature solo si se especificó (omitirlo deja el default del proveedor)
        if temperature is not None:
            llm_kwargs["temperature"] = temperature

        # Parámetros extra del proveedor → model_kwargs (p.ej. reasoning_effort)
        if model_params:
            llm_kwargs["model_kwargs"] = {**model_params}

        # Agregar parámetros opcionales
        if max_tokens:
            llm_kwargs["max_tokens"] = max_tokens
        
        if fallbacks:
            llm_kwargs["fallbacks"] = fallbacks
            logger.debug(
                f"[{ctx.workflow_id}] Fallbacks configured: {fallbacks}"
            )
        
        if api_base:
            llm_kwargs["api_base"] = api_base
            logger.debug(
                f"[{ctx.workflow_id}] Custom API base: {api_base}"
            )
        
        # Crear LLM
        llm = ChatLiteLLM(**llm_kwargs)
        
        logger.info(
            f"[{ctx.workflow_id}] LLM initialized successfully: {model_name}"
        )
        
        return llm
    
    except ImportError:
        logger.error(
            "ChatLiteLLM not available. Install with: pip install langchain-community litellm"
        )
        raise
    
    except Exception as e:
        logger.error(
            f"[{ctx.workflow_id}] Failed to initialize LLM '{model_name}': {e}",
            exc_info=True
        )
        raise


# ==========================================
# LOAD TOOLS - Carga las tools habilitadas por agente
# ==========================================
def load_tools(ctx: TenantContext, agent_name: str = "default") -> List[BaseTool]:
    """
    Carga tools para un agente específico desde sus tool_instances.
    
    Para cada tool instance del agente:
    1. Extrae tool_name, display_name, credentials, config, enabled_functions
    2. Inicializa la tool (spawn MCP server o crear wrapper)
    3. Filtra funciones si es necesario
    4. Agrega sufijo de display_name para diferenciar múltiples instancias

    Al final, sobre la lista completa (instancias + signal_tools),
    `_normalize_tool_names()` deja los nombres válidos para el proveedor y únicos.

    Args:
        ctx: TenantContext con agent_tool_instances
        agent_name: Nombre del agente ("default", "sales", "marketing", etc)
    
    Returns:
        Lista de BaseTool listas para bindear al LLM
        
    Example:
        ctx = TenantContext(
            agent_tool_instances={
                "default": {
                    "uuid-123": {
                        "tool_name": "google_calendar",
                        "display_name": "Calendar Ventas",
                        "credentials": {"token": "xxx"},
                        "config": {"calendar_id": "primary"},
                        "enabled_functions": ["check_availability", "create_event"]
                    }
                }
            },
            ...
        )
        
        tools = load_tools(ctx, agent_name="default")
        # → [GoogleCalendarTool(name="check_availability_Calendar_Ventas", ...)]
    """
    
    agent_tools = ctx.get_agent_tools(agent_name)

    if agent_tools:
        logger.info(
            f"[{ctx.workflow_id}] Loading {len(agent_tools)} tool instances "
            f"for agent '{agent_name}'"
        )
    else:
        # Sin tool instances el agente aún puede declarar signal_tools (abajo)
        logger.info(f"[{ctx.workflow_id}] No tool instances for agent '{agent_name}'")

    tools = []

    for tool_uuid, tool_instance in agent_tools.items():
        try:
            tool_name = tool_instance["tool_name"]
            display_name = tool_instance["display_name"]
            credentials = tool_instance.get("credentials", {})
            config = tool_instance.get("config", {})
            enabled_functions = tool_instance.get("enabled_functions")
            
            logger.debug(
                f"[{ctx.workflow_id}] Loading tool '{tool_name}' "
                f"(display: {display_name}, uuid: {tool_uuid}, "
                f"enabled_functions: {enabled_functions})"
            )
            
            # ==========================================
            # 1. Inicializar la tool específica
            # ==========================================
            loaded_tools = load_specific_tool(tool_name, credentials, config, ctx)
            
            if not loaded_tools:
                logger.warning(
                    f"[{ctx.workflow_id}] Tool '{tool_name}' returned empty list"
                )
                continue
            
            # ==========================================
            # 2. Filtrar funciones si es necesario
            # ==========================================
            if enabled_functions:
                loaded_tools = _filter_tool_functions(loaded_tools, enabled_functions)
            
            # ==========================================
            # 3. Clonar tools para evitar mutación de objetos compartidos
            # ==========================================
            # IMPORTANTE: Las tools pueden ser reutilizadas entre llamadas,
            # necesitamos clonarlas antes de renombrarlas para evitar side effects
            import copy
            loaded_tools = [copy.deepcopy(tool) for tool in loaded_tools]
            
            # ==========================================
            # 4. Agregar sufijo de display_name para diferenciar
            # ==========================================
            # El sufijo se pega crudo: _normalize_tool_names() lo sanea y lo topa al final,
            # cuando ya está la lista completa y se puede desempatar.
            display_suffix = display_name.replace(' ', '_').replace('-', '_')
            for tool in loaded_tools:
                original_name = tool.name
                tool.name = f"{original_name}_{display_suffix}"
                tool.description = f"{tool.description} [{display_name}]"
                # Preservar el nombre base: las configs (disable_tools_if,
                # set_variables_on_tool_call, intercept_tools_in_parallel)
                # referencian la tool por su nombre sin sufijo.
                existing_metadata = getattr(tool, "metadata", None)
                if not isinstance(existing_metadata, dict):
                    existing_metadata = {}
                tool.metadata = {**existing_metadata, "base_name": original_name}
                logger.debug(
                    f"[{ctx.workflow_id}] Renamed tool: {original_name} -> {tool.name}"
                )
            
            tools.extend(loaded_tools)
            logger.info(
                f"[{ctx.workflow_id}] Tool '{tool_name}' loaded "
                f"({len(loaded_tools)} functions)"
            )
        
        except KeyError as e:
            logger.error(
                f"[{ctx.workflow_id}] Missing required field in tool instance "
                f"{tool_uuid}: {e}"
            )
        
        except Exception as e:
            logger.error(
                f"[{ctx.workflow_id}] Failed to load tool {tool_uuid}: {e}",
                exc_info=True
            )
    
    # ==========================================
    # Signal tools declaradas por config (sin efectos; ver tools/signals.py)
    # ==========================================
    signal_defs = ctx.get_agent_config(agent_name).get("signal_tools")
    if signal_defs:
        from tools.signals import load_signal_tools
        signal_tools = load_signal_tools(signal_defs)
        tools.extend(signal_tools)
        logger.info(
            f"[{ctx.workflow_id}] Loaded {len(signal_tools)} signal tool(s) "
            f"for agent '{agent_name}'"
        )

    # ==========================================
    # Nombres válidos y únicos (última capa antes de bind_tools)
    # ==========================================
    _normalize_tool_names(tools, ctx.workflow_id)

    logger.info(
        f"[{ctx.workflow_id}] Successfully loaded {len(tools)} tools "
        f"for agent '{agent_name}'"
    )

    return tools


# ==========================================
# Registry declarativo de tool loaders
# ==========================================
# Agregar una tool = crear su módulo en tools/ y registrarla aquí con firma
# uniforme load(credentials, config, ctx) -> list[BaseTool]. Los imports son
# lazy (dentro de cada wrapper) para no pagar dependencias que no se usan.

def _load_google_calendar(credentials, config, ctx):
    from tools.google.calendar import load_google_calendar_tools
    # La zona la hereda del workflow (misma convención que Workflow.timezone:
    # ausente = hereda, explícita = override). Sin esto la tool caía a UTC
    # mientras el system prompt sí traía la hora local, y el modelo agendaba
    # con el offset entero de desfase.
    return load_google_calendar_tools(
        credentials,
        {**config, "timezone": config.get("timezone") or ctx.timezone},
    )


def _load_google_sheets(credentials, config, ctx):
    from tools.google.sheets import load_google_sheets_tools
    return load_google_sheets_tools(credentials, config)


def _load_calculator(credentials, config, ctx):
    from tools.calculator import load_calculator_tools
    return load_calculator_tools()


def _load_human_handoff(credentials, config, ctx):
    from tools.human_handoff import load_human_handoff_tools
    from tools.human_intervention import load_human_intervention_tools
    # Dos formas de activar HITL bajo el mismo tool_instance: `request_human_handoff` (el LLM
    # decide llamarla en su turno) y `activate_human_intervention` (determinista, invocada desde
    # un nodo `tool` del graph, sin que el LLM intervenga). Un solo TenantTool por organización
    # habilita ambas.
    return load_human_handoff_tools() + load_human_intervention_tools(credentials, config)


def _load_send_bulk_whatsapp(credentials, config, ctx):
    from tools.whatsapp_outbound import load_whatsapp_outbound_tools
    return load_whatsapp_outbound_tools(credentials, config)


def _load_http_request(credentials, config, ctx):
    from tools.http_request import load_http_request_tools
    return load_http_request_tools(credentials, config)


def _load_dataset(credentials, config, ctx):
    from tools.dataset import load_dataset_tools
    return load_dataset_tools(credentials, config)


TOOL_LOADERS = {
    "google_calendar": _load_google_calendar,
    "google_sheets": _load_google_sheets,
    "calculator": _load_calculator,
    "human_handoff": _load_human_handoff,
    "send_bulk_whatsapp": _load_send_bulk_whatsapp,
    "http_request": _load_http_request,
    "dataset": _load_dataset,
}


# ==========================================
# LOAD SPECIFIC TOOL - Inicializa una tool
# ==========================================
def load_specific_tool(
    tool_name: str,
    credentials: dict[str, Any],
    config: dict[str, Any],
    ctx: TenantContext
) -> list[BaseTool]:
    """
    Inicializa una tool específica con sus credenciales y filtra funciones permitidas.
    
    Aquí es donde se inicializan los MCP servers o wrappers de APIs.
    Las tools retornadas se filtran según ctx.get_enabled_functions(tool_name).
    
    IMPLEMENTACIÓN (MCP):
        if tool_name == "hubspot":
            # Spawn MCP server
            mcp_server = spawn_mcp_server(
                server_type="hubspot",
                credentials=credentials,
                config=config
            )
            # Retornar las tools del MCP server
            return mcp_server.get_tools()
    
    FILTRADO:
        - Si ctx.get_enabled_functions() retorna None → usar todas las funciones
        - Si retorna lista → filtrar para incluir solo esas funciones
    
    Args:
        tool_name: Nombre de la tool ("hubspot", "google_calendar", etc)
        credentials: Credenciales descifradas del Secret Manager
        config: Configuración específica del tenant
        ctx: TenantContext (para logging y contexto)
    
    Returns:
        Lista de BaseTool inicializadas y filtradas según permisos
        
    Example:
        tools = load_specific_tool(
            "hubspot",
            {"api_key": "xxx"},
            {"portal_id": "123"},
            ctx
        )
        # → [HubSpotTool1, HubSpotTool2] (filtradas)
    """
    
    loader = TOOL_LOADERS.get(tool_name)
    if loader is None:
        logger.warning(
            f"[{ctx.workflow_id}] Unknown tool: '{tool_name}'. "
            f"Tool loader not implemented. Available: {sorted(TOOL_LOADERS)}"
        )
        return []

    tools = loader(credentials, config, ctx)

    # Retornar las tools sin filtrado (el filtrado ahora se hace en load_tools)
    return tools if isinstance(tools, list) else [tools] if tools else []

# ==========================================
# FILTER TOOL FUNCTIONS - Filtrado de funciones
# ==========================================
def _filter_tool_functions(
    tools: list[BaseTool] | BaseTool,
    enabled_functions: list[str]
) -> list[BaseTool]:
    """
    Filtra tools según lista de funciones habilitadas.
    
    Args:
        tools: Lista de tools o tool individual del loader
        enabled_functions: Lista de nombres de funciones permitidas
    
    Returns:
        Lista de tools filtradas
        
    Example:
        all_tools = [Tool1, Tool2, Tool3, Tool4, Tool5]
        filtered = _filter_tool_functions(all_tools, ["func1", "func2"])
        # → [Tool1, Tool2] (solo las permitidas)
    """
    
    # Normalizar a lista
    if not isinstance(tools, list):
        tools = [tools] if tools else []
    
    # Sin restricciones - retornar todas
    if not enabled_functions:
        logger.debug(f"No enabled_functions filter, returning all {len(tools)} tools")
        return tools
    
    # Log para debugging
    tool_names = [t.name for t in tools]
    logger.debug(
        f"Filtering tools. Available: {tool_names}, "
        f"Allowed: {enabled_functions}"
    )
    
    # Filtrar según lista de funciones permitidas
    filtered_tools = [
        tool for tool in tools
        if tool.name in enabled_functions
    ]
    
    # Log del filtrado
    filtered_count = len(filtered_tools)
    total_count = len(tools)
    excluded = [t.name for t in tools if t.name not in enabled_functions]
    
    logger.info(
        f"Filtered tools: {filtered_count}/{total_count} functions enabled"
    )
    
    if excluded:
        logger.debug(f"Excluded functions: {excluded}")

    return filtered_tools

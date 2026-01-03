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

from core.context import TenantContext

# ==========================================
# Logger
# ==========================================
logger = logging.getLogger(__name__)


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
            f"Available keys: {list(ctx.model_configs.keys())}"
        )
    
    model_name = model_config.get("model")
    if not model_name:
        raise ValueError(
            f"Model configuration for '{model_key}' missing 'model' field"
        )
    
    # ==========================================
    # 2. Extraer parámetros
    # ==========================================
    temperature = model_config.get("temperature", 0.7)
    max_tokens = model_config.get("max_tokens")
    fallbacks = model_config.get("fallbacks", [])
    max_retries = model_config.get("max_retries", 2)
    timeout = model_config.get("timeout", 60)
    api_base = model_config.get("api_base")
    
    logger.info(
        f"[{ctx.workflow_id}] Initializing LLM with LiteLLM: {model_name} "
        f"(temperature={temperature}, fallbacks={len(fallbacks)})"
    )
    
    # ==========================================
    # 3. Inicializar con LiteLLM
    # ==========================================
    try:
        from langchain_community.chat_models import ChatLiteLLM
        
        # Construir parámetros
        llm_kwargs = {
            "model": model_name,
            "temperature": temperature,
            "max_retries": max_retries,
            "request_timeout": timeout,
            "streaming": ctx.streaming,  # Habilitar/deshabilitar streaming
        }
        
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
    
    if not agent_tools:
        logger.info(f"[{ctx.workflow_id}] No tools for agent '{agent_name}'")
        return []
    
    logger.info(
        f"[{ctx.workflow_id}] Loading {len(agent_tools)} tool instances "
        f"for agent '{agent_name}'"
    )
    
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
            display_suffix = display_name.replace(' ', '_').replace('-', '_')
            for tool in loaded_tools:
                original_name = tool.name
                tool.name = f"{original_name}_{display_suffix}"
                tool.description = f"{tool.description} [{display_name}]"
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
    
    logger.info(
        f"[{ctx.workflow_id}] Successfully loaded {len(tools)} tools "
        f"for agent '{agent_name}'"
    )
    
    return tools


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
    
    # ==========================================
    # Registry de tool loaders
    # ==========================================    
    if tool_name == "google_calendar":
        from tools.google.calendar import load_google_calendar_tools
        tools = load_google_calendar_tools(credentials, config)
    
    elif tool_name == "calculator":
        from tools.calculator import load_calculator_tools
        tools = load_calculator_tools()
    
    else:
        logger.warning(
            f"[{ctx.workflow_id}] Unknown tool: '{tool_name}'. "
            f"Tool loader not implemented."
        )
        return []
    
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


# ==========================================
# Futuro: MCP Server Manager
# ==========================================
class MCPServerManager:
    """
    FUTURO: Gestor de procesos MCP servers.
    
    Responsabilidades:
    - Spawn MCP server processes
    - Mantener pool de procesos activos
    - Cleanup de procesos idle
    - Health checks
    
    Implementación cuando integres MCP:
    
    def spawn_server(self, tool_name, credentials):
        # Spawn proceso MCP server
        process = subprocess.Popen([
            "npx", "-y", f"@modelcontextprotocol/server-{tool_name}"
        ], stdin=subprocess.PIPE, ...)
        
        # Pasar credenciales via stdin
        process.stdin.write(json.dumps(credentials))
        
        # Guardar en pool
        self.active_servers[tool_name] = process
        
        return process
    """
    pass

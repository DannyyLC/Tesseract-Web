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
    model_config = ctx.get_model_config(model_key)
    
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
# LOAD TOOLS - Carga las tools habilitadas
# ==========================================
def load_tools(ctx: TenantContext) -> List[BaseTool]:
    """
    Carga todas las tools habilitadas para este workflow.
    
    Para cada tool en ctx.enabled_tools:
    1. Obtiene credenciales del Secret Manager (ya vienen en ctx.credentials)
    2. Obtiene configuración específica del tenant (ctx.tool_configs)
    3. Inicializa la tool (spawn MCP server o crear wrapper)
    4. Retorna lista de LangChain Tools
    
    Args:
        ctx: TenantContext con tools habilitadas y credenciales
    
    Returns:
        Lista de BaseTool listas para bindear al LLM
        
    Example:
        ctx = TenantContext(
            enabled_tools=["hubspot", "google_calendar"],
            credentials={
                "hubspot": {"api_key": "xxx"},
                "google_calendar": {"token": "yyy"}
            },
            tool_configs={
                "hubspot": {"portal_id": "123"}
            },
            ...
        )
        
        tools = load_tools(ctx)
        # → [HubSpotTool(...), GoogleCalendarTool(...)]
        
        llm_with_tools = llm.bind_tools(tools)
    """
    
    if not ctx.enabled_tools:
        logger.info(f"[{ctx.workflow_id}] No tools enabled")
        return []
    
    logger.info(
        f"[{ctx.workflow_id}] Loading {len(ctx.enabled_tools)} tools: "
        f"{ctx.enabled_tools}"
    )
    
    tools = []
    
    for tool_name in ctx.enabled_tools:
        try:
            # ==========================================
            # 1. Obtener credenciales y config
            # ==========================================
            # ctx.get_tool_credentials() valida que la tool esté habilitada
            credentials = ctx.get_tool_credentials(tool_name)
            config = ctx.get_tool_config(tool_name)
            
            logger.debug(
                f"[{ctx.workflow_id}] Loading tool '{tool_name}' "
                f"with config: {list(config.keys())}"
            )
            
            # ==========================================
            # 2. Inicializar la tool específica
            # ==========================================
            loaded_tools = load_specific_tool(tool_name, credentials, config, ctx)
            
            if loaded_tools:
                tools.extend(loaded_tools)  # extend para aplanar la lista
                logger.info(f"[{ctx.workflow_id}] Tool '{tool_name}' loaded")
            else:
                logger.warning(
                    f"[{ctx.workflow_id}] Tool '{tool_name}' returned None"
                )
        
        except PermissionError as e:
            # Tool no está habilitada (no debería pasar, pero por si acaso)
            logger.error(
                f"[{ctx.workflow_id}] Permission denied for tool '{tool_name}': {e}"
            )
        
        except Exception as e:
            # Error al cargar la tool, pero no rompemos todo
            logger.error(
                f"[{ctx.workflow_id}] Failed to load tool '{tool_name}': {e}",
                exc_info=True
            )
    
    logger.info(
        f"[{ctx.workflow_id}] Successfully loaded {len(tools)} tools"
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
    
    # ==========================================
    # Filtrar funciones según configuración
    # ==========================================
    return _filter_tool_functions(tools, tool_name, ctx)

# ==========================================
# FILTER TOOL FUNCTIONS - Filtrado de funciones
# ==========================================
def _filter_tool_functions(
    tools: list[BaseTool] | BaseTool,
    tool_name: str,
    ctx: TenantContext
) -> list[BaseTool]:
    """
    Filtra tools según las funciones habilitadas en el TenantContext.
    
    Orden de precedencia:
    1. ctx.get_enabled_functions() retorna lista → filtrar
    2. ctx.get_enabled_functions() retorna None → usar todas (sin restricciones)
    
    Args:
        tools: Lista de tools o tool individual del loader
        tool_name: Nombre de la tool para obtener permisos
        ctx: TenantContext con información de funciones habilitadas
    
    Returns:
        Lista de tools filtradas según permisos
        
    Example:
        # Todas las funciones del MCP
        all_tools = [Tool1, Tool2, Tool3, Tool4, Tool5]
        
        # Filtrar según permisos
        filtered = _filter_tool_functions(all_tools, "google_calendar", ctx)
        # → [Tool1, Tool2] (solo las permitidas)
    """
    
    # Normalizar a lista
    if not isinstance(tools, list):
        tools = [tools] if tools else []
    
    # Obtener funciones habilitadas
    enabled_functions = ctx.get_enabled_functions(tool_name)
    
    # Sin restricciones - retornar todas
    if enabled_functions is None:
        logger.debug(
            f"[{ctx.workflow_id}] No function restrictions for '{tool_name}' "
            f"- using all {len(tools)} functions"
        )
        return tools
    
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
        f"[{ctx.workflow_id}] Filtered '{tool_name}': "
        f"{filtered_count}/{total_count} functions enabled"
    )
    
    if excluded:
        logger.debug(
            f"[{ctx.workflow_id}] Excluded functions for '{tool_name}': {excluded}"
        )
    
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

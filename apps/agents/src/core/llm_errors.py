"""
Falla de una llamada al LLM que ya agotó reintentos y fallbacks.

Antes cada nodo atrapaba la excepción y la convertía en la respuesta del agente
(`AIMessage("Error en nodo …")`): la ejecución salía COMPLETED con 0 tokens, el router
ruteaba con ese texto y, en un especialista, el cliente recibía el error crudo. Ahora
el nodo lanza esto y el servicer lo traduce a un código propio (LLM_CALL_FAILED) para
que el gateway marque la ejecución FAILED, no reintente y avise al equipo.

Los errores de TOOLS no pasan por aquí: esos vuelven al modelo como ToolMessage, que
es lo correcto (el modelo puede recuperarse o explicarlo).
"""

LLM_CALL_FAILED = "LLM_CALL_FAILED"


class LLMCallError(RuntimeError):
    def __init__(self, agent: str, node: str | None, cause: BaseException):
        self.agent = agent
        self.node = node
        self.cause = cause
        where = f"nodo '{node}' (agente '{agent}')" if node else f"agente '{agent}'"
        super().__init__(f"{LLM_CALL_FAILED}: {where}: {type(cause).__name__}: {cause}")

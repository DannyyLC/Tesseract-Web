"""
Prueba de humo de modelos contra los proveedores reales.

Hace una llamada mínima por combinación (modelo + parámetros) usando el MISMO camino que
el motor en producción (`registry.get_llm` → ChatLiteLLM → LiteLLM), y reporta para cada
una: si respondió, si trajo tokens de uso (sin eso el costo sale en 0) y si sabe llamar
una tool. Cuesta centavos, pero gasta: córrela a propósito, no en CI.

Para qué sirve:
- Antes de deployar el motor (sobre todo tras subir LiteLLM): las combinaciones que hoy
  corren en producción deben seguir pasando.
- Antes de habilitar un modelo nuevo: decide `supportsTemperature` y `allowedParams` del
  catálogo con datos, no por suposición.

Uso (desde apps/agents, con OPENAI_API_KEY / ANTHROPIC_API_KEY en el .env de la raíz):
    .venv/bin/python scripts/smoke_models.py              # matriz por defecto
    .venv/bin/python scripts/smoke_models.py gpt-6-luna   # solo los casos de ese modelo
"""

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT.parent.parent / ".env")

from langchain_core.messages import HumanMessage  # noqa: E402
from langchain_core.tools import tool  # noqa: E402

from core.context import TenantContext  # noqa: E402
from tools import registry  # noqa: E402

NONE_EFFORT = {"reasoning_effort": "none"}

# (etiqueta, config del agente). Las primeras reproducen lo que corre hoy en producción.
CASES = [
    ("RGM especialistas", {"model": "gpt-5.6-luna", "temperature": 1, "model_params": NONE_EFFORT}),
    ("RGM router", {"model": "gpt-5.4-mini", "temperature": 0}),
    ("plantillas", {"model": "gpt-6-luna", "temperature": 1}),
    ("luna6 none sin temp", {"model": "gpt-6-luna", "model_params": NONE_EFFORT}),
    ("luna6 none temp 0", {"model": "gpt-6-luna", "temperature": 0, "model_params": NONE_EFFORT}),
    ("luna6 none temp 1", {"model": "gpt-6-luna", "temperature": 1, "model_params": NONE_EFFORT}),
    ("sol6.1 none sin temp", {"model": "gpt-6.1-sol", "model_params": NONE_EFFORT}),
    ("haiku 5.5", {"model": "claude-haiku-5-5"}),
    ("sonnet 5.5", {"model": "claude-sonnet-5-5"}),
    ("opus 5.5", {"model": "claude-opus-5-5"}),
    ("haiku 5.5 temp 0.3 (debe fallar)", {"model": "claude-haiku-5-5", "temperature": 0.3}),
]


@tool
def consultar_catalogo(producto: str) -> str:
    """Busca un producto en el catálogo y regresa su precio."""
    return f"{producto}: $100"


def make_ctx(agent_config: dict, streaming: bool) -> TenantContext:
    return TenantContext(
        tenant_id="smoke",
        workflow_id="smoke",
        conversation_id="smoke",
        user_type="internal",
        user_id="smoke",
        channel="dashboard",
        timezone="UTC",
        agents_config={"default": {**agent_config, "max_tokens": 200}},
        streaming=streaming,
    )


def usage_of(message) -> int:
    usage = getattr(message, "usage_metadata", None) or {}
    return int(usage.get("input_tokens", 0)) + int(usage.get("output_tokens", 0))


def run_case(agent_config: dict) -> dict:
    result = {}
    prompt = [HumanMessage(content="Responde solo: ok")]

    # 1. Sin streaming: respuesta + tokens de uso.
    llm = registry.get_llm(make_ctx(agent_config, streaming=False))
    reply = llm.invoke(prompt)
    result["texto"] = (reply.content or "").strip()[:20]
    result["tokens"] = usage_of(reply)
    result["modelo_reportado"] = (reply.response_metadata or {}).get("model_name", "?")

    # 2. Con streaming: el motor en canales web/WhatsApp-stream depende de que el último
    #    chunk traiga el uso; si no, la ejecución se cobra en 0.
    llm_stream = registry.get_llm(make_ctx(agent_config, streaming=True))
    total = None
    for chunk in llm_stream.stream(prompt):
        total = chunk if total is None else total + chunk
    result["tokens_stream"] = usage_of(total) if total is not None else 0

    # 3. Tool calling.
    llm_tools = registry.get_llm(make_ctx(agent_config, streaming=False)).bind_tools([consultar_catalogo])
    tool_reply = llm_tools.invoke(
        [HumanMessage(content="¿Cuánto cuesta el chaleco nivel IIIA? Usa la herramienta.")]
    )
    result["tool_call"] = bool(getattr(tool_reply, "tool_calls", None))
    return result


def main() -> int:
    only = set(sys.argv[1:])
    cases = [c for c in CASES if not only or c[1]["model"] in only]
    failures = 0

    for label, cfg in cases:
        params = {k: v for k, v in cfg.items() if k != "model"}
        started = time.time()
        try:
            r = run_case(cfg)
            ok = r["tokens"] > 0 and r["tokens_stream"] > 0 and r["tool_call"]
            status = "OK  " if ok else "WARN"
            if not ok:
                failures += 1
            print(
                f"{status} {label:<34} {cfg['model']:<18} {str(params):<55} "
                f"tokens={r['tokens']} stream={r['tokens_stream']} tool={r['tool_call']} "
                f"modelo={r['modelo_reportado']} ({time.time() - started:.1f}s)"
            )
        except Exception as e:  # noqa: BLE001 — se reporta tal cual, es lo que se quiere ver
            failures += 1
            print(f"FAIL {label:<34} {cfg['model']:<18} {str(params):<55} {type(e).__name__}: {str(e)[:160]}")

    print(f"\n{len(cases) - failures}/{len(cases)} sin observaciones")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

"""
Accounting de tokens por modelo — compartido por los RPCs Execute y ExecuteStream.

Semántica: input y output se SUMAN sobre todas las llamadas, agrupados por modelo.
Es lo que factura el proveedor — cada llamada a la API se cobra con su payload
completo, sin importar cuánto se parezca al de la llamada anterior. Aplica igual a
las iteraciones de un loop agéntico, a las ramas de un fan-out paralelo y a los
nodos silent.

Hubo una versión que tomaba el MÁXIMO del input por modelo, con el razonamiento de
que un ReAct reenvía el mismo historial y sumarlo lo contaría N veces. Medía
"contexto único", que no es lo que nadie paga: subestimaba el costo por un factor
cercano al número de llamadas (≈3× en el fan-out del RGM, otro tanto por el loop
agéntico de sus verticales).

Límite conocido: el prompt caching NO está modelado. Los proveedores descuentan el
prefijo repetido —justo el caso secuencial— y `usage_metadata` lo reporta en
`input_token_details.cache_read`, pero aquí no se separa y `llm_models` no tiene
precio de input cacheado. O sea que el número es a precio de lista y queda POR
ARRIBA de la factura real donde el cacheo entra. Es un techo, no el valor exacto.
"""


class UsageAccumulator:
    """Acumula usage_metadata de llamadas LLM agrupado por modelo."""

    def __init__(self, default_model: str = "unknown"):
        self._default_model = default_model
        self._usage: dict[str, dict] = {}

    def add(self, usage: dict | None, response_metadata: dict | None) -> None:
        if not usage:
            return
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)

        model_name = "unknown"
        if response_metadata:
            model_name = (
                response_metadata.get("model_name")
                or response_metadata.get("model", "unknown")
            )
        if model_name == "unknown":
            model_name = self._default_model

        if model_name not in self._usage:
            self._usage[model_name] = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

        self._usage[model_name]["input_tokens"] += input_tokens
        self._usage[model_name]["output_tokens"] += output_tokens

    def totals(self) -> dict[str, dict]:
        """Cierra el cálculo. Por asignación, no acumulando: llamarlo dos veces da lo mismo."""
        for data in self._usage.values():
            data["total_tokens"] = data["input_tokens"] + data["output_tokens"]
        return self._usage

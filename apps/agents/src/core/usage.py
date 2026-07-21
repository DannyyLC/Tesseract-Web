"""
Accounting de tokens por modelo — compartido por los RPCs Execute y ExecuteStream.

Semántica (idéntica a la histórica del servicer):
- output_tokens: se SUMAN todas las llamadas.
- input_tokens: se toma el MÁXIMO por modelo (cada llamada re-envía el historial
  completo; sumar inputs sobre-contaría el mismo contexto N veces).
- total = max_input + sum_output.
"""


class UsageAccumulator:
    """Acumula usage_metadata de llamadas LLM agrupado por modelo."""

    def __init__(self, default_model: str = "unknown"):
        self._default_model = default_model
        self._usage: dict[str, dict] = {}
        self._max_input: dict[str, int] = {}

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
            self._max_input[model_name] = 0

        if input_tokens > self._max_input[model_name]:
            self._max_input[model_name] = input_tokens
        self._usage[model_name]["output_tokens"] += output_tokens

    def totals(self) -> dict[str, dict]:
        """Cierra el cálculo: input = máximo observado, total = input + output."""
        for name, data in self._usage.items():
            data["input_tokens"] = self._max_input[name]
            data["total_tokens"] = self._max_input[name] + data["output_tokens"]
        return self._usage

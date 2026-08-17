"""
Tests para el accounting de tokens (UsageAccumulator).

El punto de todos: input y output se SUMAN sobre cada llamada al LLM, porque cada
llamada se factura completa. La versión anterior tomaba el máximo del input por
modelo y subestimaba el costo en los tres casos que cubren los primeros tests.
"""

import sys
from pathlib import Path

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from core.usage import UsageAccumulator  # noqa: E402


def meta(model: str) -> dict:
    return {"model_name": model}


def usage(input_tokens: int, output_tokens: int) -> dict:
    return {"input_tokens": input_tokens, "output_tokens": output_tokens}


class TestUsageAccumulator:
    """Suma por modelo sobre todas las llamadas."""

    def test_loop_agentico_suma_cada_iteracion(self):
        """
        Un loop agéntico crece el historial en cada vuelta y el proveedor cobra las
        tres llamadas completas. El máximo reportaba 7 000.
        """
        acc = UsageAccumulator("gpt-5.6-luna")
        acc.add(usage(5_000, 100), meta("gpt-5.6-luna"))
        acc.add(usage(6_000, 150), meta("gpt-5.6-luna"))
        acc.add(usage(7_000, 200), meta("gpt-5.6-luna"))

        totals = acc.totals()
        assert totals["gpt-5.6-luna"]["input_tokens"] == 18_000
        assert totals["gpt-5.6-luna"]["output_tokens"] == 450
        assert totals["gpt-5.6-luna"]["total_tokens"] == 18_450

    def test_fan_out_suma_cada_rama(self):
        """
        Tres ramas paralelas mandan historiales distintos. Comparten modelo, así que
        el máximo dejaba vivir solo una (8 000 en vez de 24 000).
        """
        acc = UsageAccumulator("gpt-5.6-luna")
        for _ in range(3):
            acc.add(usage(8_000, 300), meta("gpt-5.6-luna"))

        totals = acc.totals()
        assert totals["gpt-5.6-luna"]["input_tokens"] == 24_000
        assert totals["gpt-5.6-luna"]["output_tokens"] == 900

    def test_nodos_silent_suman_como_llamadas_independientes(self):
        """Cada nodo silent es una llamada aparte, no un reenvío del mismo historial."""
        acc = UsageAccumulator("gpt-5.4-mini")
        acc.add(usage(2_000, 20), meta("gpt-5.4-mini"))
        acc.add(usage(2_100, 25), meta("gpt-5.4-mini"))

        assert acc.totals()["gpt-5.4-mini"]["input_tokens"] == 4_100

    def test_agrupa_por_modelo(self):
        """Cada modelo lleva su propia suma: el costo se calcula con su precio."""
        acc = UsageAccumulator("gpt-5.6-luna")
        acc.add(usage(1_000, 50), meta("gpt-5.4-mini"))
        acc.add(usage(4_000, 200), meta("gpt-5.6-luna"))
        acc.add(usage(1_500, 60), meta("gpt-5.4-mini"))

        totals = acc.totals()
        assert set(totals) == {"gpt-5.4-mini", "gpt-5.6-luna"}
        assert totals["gpt-5.4-mini"]["input_tokens"] == 2_500
        assert totals["gpt-5.6-luna"]["input_tokens"] == 4_000

    def test_totals_es_idempotente(self):
        """El servicer puede cerrarlo dos veces sin duplicar el total."""
        acc = UsageAccumulator("gpt-5.6-luna")
        acc.add(usage(1_000, 100), meta("gpt-5.6-luna"))

        primero = dict(acc.totals()["gpt-5.6-luna"])
        segundo = acc.totals()["gpt-5.6-luna"]
        assert segundo == primero
        assert segundo["total_tokens"] == 1_100

    def test_usage_vacio_no_acumula(self):
        """Los mensajes sin usage_metadata (p.ej. el pass-through del synthesizer)."""
        acc = UsageAccumulator("gpt-5.6-luna")
        acc.add(None, meta("gpt-5.6-luna"))
        acc.add({}, meta("gpt-5.6-luna"))

        assert acc.totals() == {}

    def test_sin_response_metadata_cae_en_el_modelo_default(self):
        acc = UsageAccumulator("gpt-5.6-luna")
        acc.add(usage(500, 10), None)

        assert acc.totals()["gpt-5.6-luna"]["input_tokens"] == 500

    def test_usa_model_cuando_no_hay_model_name(self):
        """Algunos proveedores reportan 'model' en vez de 'model_name'."""
        acc = UsageAccumulator("default-model")
        acc.add(usage(700, 30), {"model": "claude-fake-1"})

        assert acc.totals()["claude-fake-1"]["input_tokens"] == 700

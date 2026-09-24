"""
Tests unitarios de `evaluate_condition` (apps/agents/src/graphs/pipeline/conditions.py).

No existían casos directos para esta función — solo se ejercitaba indirecto vía
`test_pipeline_primitives.py` armando un grafo completo. Aquí se prueba en aislamiento,
un caso por operador, más el manejo de operador desconocido y de errores de tipo.
"""

import sys
from pathlib import Path

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

import pytest  # noqa: E402
from graphs.pipeline.conditions import evaluate_condition  # noqa: E402


class TestEvaluateCondition:

    @pytest.mark.parametrize(
        "op, field_value, compare_value, expected",
        [
            ("eq", "sedan", "sedan", True),
            ("eq", "sedan", "suv", False),
            ("neq", "sedan", "suv", True),
            ("neq", "sedan", "sedan", False),
            ("gt", 10, 5, True),
            ("gt", 5, 10, False),
            ("gte", 10, 10, True),
            ("gte", 9, 10, False),
            ("lt", 5, 10, True),
            ("lt", 10, 5, False),
            ("lte", 10, 10, True),
            ("lte", 11, 10, False),
            ("contains", "524491960671", "449", True),
            ("contains", "527531157535", "449", False),
            ("in", "b", ["a", "b", "c"], True),
            ("in", "z", ["a", "b", "c"], False),
            ("starts_with", "524491960671", "52449", True),
            ("starts_with", "527531157535", "52449", False),
            ("starts_with", "524491960671", "449", False),
        ],
    )
    def test_operadores(self, op, field_value, compare_value, expected):
        assert evaluate_condition(op, field_value, compare_value) is expected

    def test_operador_desconocido_devuelve_false(self, caplog):
        assert evaluate_condition("regex", "algo", "algo") is False
        assert "Operador de condición desconocido" in caplog.text

    def test_type_error_devuelve_false(self):
        # "gt" entre tipos incompatibles (int vs str) revienta con TypeError en Python puro.
        assert evaluate_condition("gt", 5, "cinco") is False

    def test_starts_with_castea_a_string(self):
        # field_value numérico: debe compararse como string, no reventar.
        assert evaluate_condition("starts_with", 524491960671, "52449") is True

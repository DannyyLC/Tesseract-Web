"""
Tests para las herramientas de calculadora.
"""

import pytest
import sys
from pathlib import Path

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from tools.calculator import (
    calculator,
    percentage,
    currency_convert,
    safe_eval
)


class TestCalculator:
    """Tests para la herramienta calculator."""
    
    def test_basic_addition(self):
        """Prueba suma básica."""
        result = calculator.invoke({"expression": "2 + 2"})
        assert "4" in result
    
    def test_basic_multiplication(self):
        """Prueba multiplicación."""
        result = calculator.invoke({"expression": "5 * 3"})
        assert "15" in result
    
    def test_complex_expression(self):
        """Prueba expresión compleja."""
        result = calculator.invoke({"expression": "(10 + 5) * 2 - 3"})
        assert "27" in result
    
    def test_division(self):
        """Prueba división."""
        result = calculator.invoke({"expression": "100 / 4"})
        assert "25" in result
    
    def test_invalid_expression(self):
        """Prueba expresión inválida."""
        result = calculator.invoke({"expression": "2 + + 2"})
        assert "error" in result.lower()
    
    def test_unsafe_expression(self):
        """Prueba expresión insegura (debe fallar)."""
        result = calculator.invoke({"expression": "import os"})
        assert "error" in result.lower()


class TestPercentage:
    """Tests para la herramienta percentage."""
    
    def test_basic_percentage(self):
        """Prueba cálculo de porcentaje básico."""
        result = percentage.invoke({"value": 100, "percent": 15})
        assert "15" in result
    
    def test_percentage_of_large_number(self):
        """Prueba porcentaje de número grande."""
        result = percentage.invoke({"value": 2350, "percent": 15})
        assert "352.5" in result
    
    def test_zero_percentage(self):
        """Prueba porcentaje de 0."""
        result = percentage.invoke({"value": 100, "percent": 0})
        assert "0" in result
    
    def test_100_percent(self):
        """Prueba 100%."""
        result = percentage.invoke({"value": 500, "percent": 100})
        assert "500" in result
    
    def test_decimal_percentage(self):
        """Prueba con decimales."""
        result = percentage.invoke({"value": 200, "percent": 12.5})
        assert "25" in result


class TestCurrencyConvert:
    """Tests para la herramienta currency_convert."""
    
    def test_usd_to_mxn(self):
        """Prueba conversión USD a MXN."""
        result = currency_convert.invoke({"amount": 100, "from_currency": "USD", "to_currency": "MXN"})
        assert "USD" in result
        assert "MXN" in result
    
    def test_same_currency(self):
        """Prueba misma moneda."""
        result = currency_convert.invoke({"amount": 100, "from_currency": "USD", "to_currency": "USD"})
        assert "100" in result
    
    def test_case_insensitive(self):
        """Prueba que acepta minúsculas."""
        result = currency_convert.invoke({"amount": 100, "from_currency": "usd", "to_currency": "mxn"})
        assert "error" not in result.lower()
    
    def test_unknown_currency_pair(self):
        """Prueba par de monedas desconocido."""
        result = currency_convert.invoke({"amount": 100, "from_currency": "USD", "to_currency": "XYZ"})
        assert "not available" in result


class TestSafeEval:
    """Tests para safe_eval."""
    
    def test_safe_operations(self):
        """Prueba operaciones seguras."""
        assert safe_eval("2 + 2") == 4.0
        assert safe_eval("10 * 5") == 50.0
        assert safe_eval("100 / 4") == 25.0
    
    def test_reject_import(self):
        """Debe rechazar imports."""
        with pytest.raises(ValueError):
            safe_eval("import os")
    
    def test_reject_exec(self):
        """Debe rechazar funciones peligrosas."""
        with pytest.raises(ValueError):
            safe_eval("exec('print(1)')")
    
    def test_reject_variables(self):
        """Debe rechazar acceso a variables."""
        with pytest.raises(ValueError):
            safe_eval("x = 5")

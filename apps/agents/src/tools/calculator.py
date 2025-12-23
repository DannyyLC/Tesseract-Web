"""
Calculator Tools - Operaciones matemáticas y numéricas.

NOTA: Esta NO es una herramienta MCP.
Calculator es tan simple que no necesita un servidor externo.
Se implementa directamente en Python usando eval() seguro.

Tools disponibles:
- calculator: Evalúa expresiones matemáticas
- percentage: Calcula porcentajes
- currency_convert: Conversión básica de moneda (mock)

USO TÍPICO:
- LLM necesita hacer cálculos: "¿Cuánto es 15% de $2,350?"
- Conversiones: "Convertir 100 USD a MXN"
- Operaciones básicas: "2 + 2", "10 * 5 / 2"
"""

from typing import Any
from langchain_core.tools import BaseTool, tool
import logging
import re
import ast
import operator

logger = logging.getLogger(__name__)


# ==========================================
# Operadores permitidos para eval seguro
# ==========================================
SAFE_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
}


def safe_eval(expression: str) -> float:
    """
    Evalúa expresiones matemáticas de forma segura.
    
    SEGURIDAD:
    - Solo permite operadores matemáticos básicos
    - No permite import, exec, eval, etc
    - No permite acceso a variables/funciones
    
    Args:
        expression: Expresión matemática (ej: "2 + 2", "10 * 5 / 2")
    
    Returns:
        Resultado numérico
        
    Raises:
        ValueError: Si la expresión es inválida o insegura
    """
    # Limpiar espacios
    expression = expression.strip()
    
    # Remover caracteres no permitidos
    if not re.match(r'^[\d\s\+\-\*\/\(\)\.\%]+$', expression):
        raise ValueError(
            "Expression contains invalid characters. "
            "Only numbers and operators (+, -, *, /, %, (, )) are allowed."
        )
    
    try:
        # Parsear la expresión
        node = ast.parse(expression, mode='eval')
        
        # Evaluar nodo por nodo
        def _eval(node):
            if isinstance(node, ast.Expression):
                return _eval(node.body)
            
            elif isinstance(node, ast.Num):  # Números
                return node.n
            
            elif isinstance(node, ast.BinOp):  # Operadores binarios
                op_type = type(node.op)
                if op_type not in SAFE_OPERATORS:
                    raise ValueError(f"Operator {op_type} not allowed")
                
                left = _eval(node.left)
                right = _eval(node.right)
                return SAFE_OPERATORS[op_type](left, right)
            
            elif isinstance(node, ast.UnaryOp):  # Operadores unarios (ej: -5)
                op_type = type(node.op)
                if op_type not in SAFE_OPERATORS:
                    raise ValueError(f"Operator {op_type} not allowed")
                
                operand = _eval(node.operand)
                return SAFE_OPERATORS[op_type](operand)
            
            else:
                raise ValueError(f"Node type {type(node)} not allowed")
        
        result = _eval(node)
        return float(result)
    
    except Exception as e:
        raise ValueError(f"Invalid mathematical expression: {str(e)}")


# ==========================================
# Tools
# ==========================================

@tool
def calculator(expression: str) -> str:
    """
    Evalúa expresiones matemáticas de forma segura.
    
    Soporta:
    - Operaciones básicas: +, -, *, /
    - Paréntesis para precedencia: (2 + 3) * 4
    - Decimales: 3.14 * 2
    - Módulo: 10 % 3
    - Potencias: 2 ** 8
    
    Args:
        expression: Expresión matemática a evaluar
    
    Returns:
        Resultado del cálculo como string
    
    Examples:
        calculator("2 + 2") → "4.0"
        calculator("(10 + 5) * 2") → "30.0"
        calculator("100 / 3") → "33.333333333333336"
        calculator("2 ** 10") → "1024.0"
    """
    try:
        result = safe_eval(expression)
        logger.info(f"Calculator: {expression} = {result}")
        return str(result)
    except ValueError as e:
        error_msg = f"Error: {str(e)}"
        logger.warning(f"Calculator error: {expression} - {error_msg}")
        return error_msg
    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        logger.error(f"Calculator unexpected error: {expression} - {error_msg}")
        return error_msg


@tool
def percentage(value: float, percent: float) -> str:
    """
    Calcula el porcentaje de un valor.
    
    Args:
        value: Valor base
        percent: Porcentaje a calcular (ej: 15 para 15%)
    
    Returns:
        Resultado del cálculo
    
    Examples:
        percentage(100, 15) → "15% of 100 is 15.0"
        percentage(2350, 15) → "15% of 2350 is 352.5"
    """
    try:
        result = (value * percent) / 100
        logger.info(f"Percentage: {percent}% of {value} = {result}")
        return f"{percent}% of {value} is {result}"
    except Exception as e:
        error_msg = f"Error calculating percentage: {str(e)}"
        logger.error(error_msg)
        return error_msg


@tool
def currency_convert(
    amount: float,
    from_currency: str,
    to_currency: str
) -> str:
    """
    Convierte entre monedas (versión mock).
    
    NOTA: Esta es una implementación mock para testing.
    En producción, deberías integrar con API real como:
    - exchangerate-api.com
    - fixer.io
    - currencyapi.com
    
    Args:
        amount: Cantidad a convertir
        from_currency: Moneda origen (USD, MXN, EUR, etc)
        to_currency: Moneda destino
    
    Returns:
        Resultado de la conversión
    
    Examples:
        currency_convert(100, "USD", "MXN")
        → "100 USD = 1,700 MXN (mock rate: 17.0)"
    """
    # Tasas mock (actualizar con API real)
    mock_rates = {
        ("USD", "MXN"): 17.0,
        ("MXN", "USD"): 0.059,
        ("USD", "EUR"): 0.85,
        ("EUR", "USD"): 1.18,
        ("USD", "GBP"): 0.73,
        ("GBP", "USD"): 1.37,
    }
    
    try:
        from_currency = from_currency.upper()
        to_currency = to_currency.upper()
        
        # Misma moneda
        if from_currency == to_currency:
            return f"{amount} {from_currency} = {amount} {to_currency}"
        
        # Buscar tasa
        rate = mock_rates.get((from_currency, to_currency))
        
        if not rate:
            return (
                f"Mock conversion rate not available for "
                f"{from_currency} → {to_currency}. "
                f"In production, integrate real currency API."
            )
        
        result = amount * rate
        
        logger.info(
            f"Currency convert: {amount} {from_currency} = "
            f"{result} {to_currency} (rate: {rate})"
        )
        
        return (
            f"{amount:,.2f} {from_currency} = "
            f"{result:,.2f} {to_currency} "
            f"(mock rate: {rate})"
        )
    
    except Exception as e:
        error_msg = f"Error converting currency: {str(e)}"
        logger.error(error_msg)
        return error_msg


# ==========================================
# Función principal para el registry
# ==========================================

def load_calculator_tools() -> list[BaseTool]:
    """
    Retorna todas las tools de calculadora.
    
    Esta función es llamada por tools/registry.py cuando
    un workflow tiene "calculator" en enabled_tools.
    
    Returns:
        Lista de tools matemáticas disponibles
    """
    logger.info("Loading calculator tools (no credentials needed)")
    
    return [
        calculator,
        percentage,
        currency_convert,
    ]


# ==========================================
# Testing
# ==========================================

if __name__ == "__main__":
    """Prueba las tools localmente."""
    
    print("Testing calculator tools...\n")
    
    # Test calculator
    print("1. Calculator:")
    print(f"   2 + 2 = {calculator.invoke('2 + 2')}")
    print(f"   (10 + 5) * 2 = {calculator.invoke('(10 + 5) * 2')}")
    print(f"   100 / 3 = {calculator.invoke('100 / 3')}")
    print(f"   2 ** 10 = {calculator.invoke('2 ** 10')}")
    
    # Test percentage
    print("\n2. Percentage:")
    print(f"   {percentage.invoke({'value': 100, 'percent': 15})}")
    print(f"   {percentage.invoke({'value': 2350, 'percent': 15})}")
    
    # Test currency
    print("\n3. Currency Convert:")
    print(f"   {currency_convert.invoke({'amount': 100, 'from_currency': 'USD', 'to_currency': 'MXN'})}")
    print(f"   {currency_convert.invoke({'amount': 1000, 'from_currency': 'MXN', 'to_currency': 'USD'})}")
    
    print("\n✅ All tools working!")

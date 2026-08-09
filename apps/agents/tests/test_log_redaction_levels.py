"""
Los datos del cliente no pueden salir por encima de DEBUG.

En producción el nivel efectivo es INFO, así que todo lo que se emita a INFO, WARNING
o ERROR acaba en Cloud Logging con 30 días de retención. Los parámetros y resultados de
las tools son justo donde viajan los datos del cliente en el RGM —teléfonos, montos,
filas de Sheets—, así que van a DEBUG y a INFO queda solo la señal operativa.

Este test existe porque el barrido manual falla: se detectó tarde que el nodo de tool
logueaba `rendered_params` completo a INFO.
"""

import logging
from unittest.mock import patch

from graphs.pipeline.nodes.tool import make_tool_node

from tests.test_pipeline_primitives import FakeTool, initial_state, make_ctx


SECRETO = "+5215512345678 Juan Pérez $12,345.00"


def _node(result):
    ctx = make_ctx()
    ctx.agent_tool_instances = {"a": {"uuid-1": {
        "tool_name": "t", "credentials": {}, "config": {},
    }}}
    cfg = {"tool_instance": "uuid-1", "function": "fn", "params": {"dato": SECRETO}}
    with patch("tools.registry.load_specific_tool", return_value=[FakeTool(result)]):
        return make_tool_node("n", cfg, ctx)


def _mensajes(caplog, *niveles):
    return "\n".join(r.getMessage() for r in caplog.records if r.levelno in niveles)


def test_los_params_no_salen_a_info(caplog):
    node = _node("ok")

    with caplog.at_level(logging.INFO):
        node(initial_state())

    salida = _mensajes(caplog, logging.INFO, logging.WARNING, logging.ERROR)
    assert SECRETO not in salida
    # La señal operativa sí tiene que quedar: qué tool se ejecutó.
    assert "executing" in salida


def test_el_resultado_no_sale_a_info(caplog):
    node = _node(f"respuesta con {SECRETO} dentro")

    with caplog.at_level(logging.INFO):
        node(initial_state())

    assert SECRETO not in _mensajes(caplog, logging.INFO, logging.WARNING, logging.ERROR)


def test_a_debug_si_estan_disponibles_para_depurar(caplog):
    """Quitar el dato de INFO no puede significar perderlo: con LOG_LEVEL=debug vuelve."""
    node = _node("ok")

    with caplog.at_level(logging.DEBUG):
        node(initial_state())

    assert SECRETO in _mensajes(caplog, logging.DEBUG)

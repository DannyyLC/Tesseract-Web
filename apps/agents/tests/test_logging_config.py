import json
import logging

from core.logging_config import GcpJsonFormatter


def _record(level: int, message: str, exc_info=None) -> logging.LogRecord:
    return logging.LogRecord(
        name="tesseract.test",
        level=level,
        pathname=__file__,
        lineno=1,
        msg=message,
        args=(),
        exc_info=exc_info,
    )


def test_maps_levels_to_cloud_logging_severity():
    """Sin `severity`, Cloud Logging mete todo como INFO y no se puede filtrar."""
    formatter = GcpJsonFormatter()

    esperado = {
        logging.DEBUG: "DEBUG",
        logging.INFO: "INFO",
        logging.WARNING: "WARNING",
        logging.ERROR: "ERROR",
        logging.CRITICAL: "CRITICAL",
    }

    for level, severity in esperado.items():
        entry = json.loads(formatter.format(_record(level, "hola")))
        assert entry["severity"] == severity


def test_emits_one_json_line_per_record():
    """Cloud Logging parte por saltos de línea: una entrada tiene que ser una línea."""
    formatter = GcpJsonFormatter()
    salida = formatter.format(_record(logging.INFO, "línea uno\nlínea dos"))

    assert "\n" not in salida
    assert json.loads(salida)["message"] == "línea uno\nlínea dos"


def test_traceback_travels_inside_the_entry():
    formatter = GcpJsonFormatter()
    try:
        raise ValueError("algo tronó")
    except ValueError:
        import sys

        salida = formatter.format(_record(logging.ERROR, "falló", exc_info=sys.exc_info()))

    assert "\n" not in salida
    entry = json.loads(salida)
    assert entry["severity"] == "ERROR"
    assert "ValueError: algo tronó" in entry["stack"]


def test_unknown_level_does_not_crash():
    formatter = GcpJsonFormatter()
    record = _record(logging.INFO, "nivel raro")
    record.levelname = "TRACE"

    assert json.loads(formatter.format(record))["severity"] == "DEFAULT"

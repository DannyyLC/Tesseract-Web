"""
Configuración de logging para Cloud Run.

Cloud Logging clasifica cada entrada por el campo `severity`. El logging de Python
escribe `levelname`, que Cloud Logging ignora, así que sin este formatter TODO entra
como INFO —incluidos los logger.error— y filtrar por severidad no devuelve nada.

Es el espejo del mapeo `gcpSeverity` del gateway (apps/gateway/src/app.module.ts): los
dos servicios tienen que verse igual en Cloud Logging para poder consultarlos juntos.

Aparte de la severidad, el JSON de una sola línea resuelve el otro problema del texto
plano: un traceback multilínea se convierte en N entradas sueltas, porque Cloud Logging
trata cada línea como una entrada independiente. Serializado en `message`, el traceback
viaja completo dentro de una sola.
"""

import json
import logging
import os
import sys
from core.env_validation import is_production

GCP_SEVERITY_BY_LEVEL = {
    "DEBUG": "DEBUG",
    "INFO": "INFO",
    "WARNING": "WARNING",
    "ERROR": "ERROR",
    "CRITICAL": "CRITICAL",
}


class GcpJsonFormatter(logging.Formatter):
    """Serializa cada registro como una línea de JSON con `severity`."""

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "severity": GCP_SEVERITY_BY_LEVEL.get(record.levelname, "DEFAULT"),
            "message": record.getMessage(),
            "logger": record.name,
        }

        # El traceback va dentro del mismo objeto, no en líneas aparte.
        if record.exc_info:
            entry["stack"] = self.formatException(record.exc_info)

        return json.dumps(entry, ensure_ascii=False)


def configure_logging() -> None:
    """
    Instala el formatter en el logger raíz.

    En local se deja el texto plano de siempre: el JSON es ilegible en una terminal y
    ahí no hay Cloud Logging que lo consuma. `LOG_LEVEL` es opcional a propósito, igual
    que en el gateway — las variables de entorno del servicio viven solo en la consola
    de GCP, así que el default tiene que ser el correcto.

    Qué cuenta como producción lo decide `is_production()` (core/env_validation.py), que
    es la misma respuesta que usa la validación del arranque.
    """
    level = os.getenv("LOG_LEVEL", "INFO").upper()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        GcpJsonFormatter()
        if is_production()
        else logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    )

    logging.basicConfig(level=level, handlers=[handler], force=True)

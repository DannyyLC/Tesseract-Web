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

    El discriminante es `K_SERVICE`, que Cloud Run inyecta solo en cada revisión. A
    diferencia del gateway no usamos `NODE_ENV`: el Dockerfile de agents no lo define, y
    depender de una variable que hay que acordarse de poner a mano es justo la forma de
    que el JSON no salga y nadie se entere. Se respeta igual si alguien la pone explícita,
    para poder reproducir el formato de producción fuera de Cloud Run.
    """
    is_production = bool(os.getenv("K_SERVICE")) or os.getenv("NODE_ENV") == "production"
    level = os.getenv("LOG_LEVEL", "INFO").upper()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        GcpJsonFormatter()
        if is_production
        else logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    )

    logging.basicConfig(level=level, handlers=[handler], force=True)

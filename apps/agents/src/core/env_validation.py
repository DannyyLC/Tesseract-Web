"""
Validación de variables de entorno antes de que arranque el servidor.

Espejo de `apps/gateway/src/platform/config/env-validation.ts`: una lista de obligatorias
en producción, un mensaje que las enumera y `sys.exit(1)`.

**Por qué reventar al arrancar y no solo fallar después.** Si el proceso arranca sin una
variable crítica, Cloud Run lo ve sano y le manda tráfico. Si *no* arranca, la revisión nunca
queda lista y la anterior sigue sirviendo: mismo aviso ruidoso, sin corte.
"""

import os
import sys

# ─── Obligatorias en producción ───────────────────────────────────────────────

# Hoy vacía. Era `AGENTS_INTERNAL_SECRET`, que autenticaba al Gateway con un secreto
# compartido; desde la migración a OIDC eso lo hace Cloud Run con IAM, fuera de este proceso.
REQUIRED_IN_PRODUCTION: list[str] = []

# La lista se queda corta a propósito. Las ~36 variables del servicio viven solo en la consola
# de GCP, sin versionar; cada nombre que se agregue aquí es una forma nueva de que un deploy
# legítimo no levante. Solo entran las que, faltando, dejan un agujero de seguridad —no las que
# rompen una función concreta, que fallan solas y con un error que apunta al lugar correcto.


def is_production() -> bool:
    """
    `True` cuando el proceso corre en Cloud Run.

    El discriminante es `K_SERVICE`, que Cloud Run inyecta en cada revisión. A diferencia del
    gateway no usamos `NODE_ENV`: el Dockerfile de agents no la define, y depender de una
    variable que hay que acordarse de poner a mano es justo la forma de que la validación no
    corra y nadie se entere. Se respeta igual si alguien la pone explícita, para poder
    reproducir el comportamiento de producción fuera de Cloud Run.

    Vive aquí y no en `logging_config` porque la usan las dos: si se duplicara, una copia
    podría creer que no está en producción —saltándose esta validación— mientras la otra cree
    que sí.
    """
    return bool(os.getenv("K_SERVICE")) or os.getenv("NODE_ENV") == "production"


def validate_env() -> None:
    """Corta el arranque si falta alguna obligatoria. No hace nada fuera de producción."""
    if not is_production():
        return

    missing = [key for key in REQUIRED_IN_PRODUCTION if not os.getenv(key)]
    if not missing:
        return

    print("\nFaltan variables de entorno obligatorias:\n", file=sys.stderr)
    for key in missing:
        print(f"    - {key}", file=sys.stderr)
    print(
        "\nConfigúralas en GCP Secret Manager (o en las variables del servicio) y vuelve a desplegar.\n",
        file=sys.stderr,
    )
    sys.exit(1)

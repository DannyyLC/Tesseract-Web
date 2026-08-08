"""
Enmascarado de datos personales para los logs.

Espejo exacto de `mask-phone.ts` del gateway
(apps/gateway/src/platform/common/utils/mask-phone.ts): el mismo número tiene que
producir la misma cadena en los dos servicios, o no se pueden correlacionar sus logs
en Cloud Logging. Si cambias uno, cambia el otro.
"""

import re

#: Dígitos iniciales que se conservan: bastan para distinguir el país de origen.
PREFIX_LENGTH = 2
#: Dígitos finales que se conservan: es como la gente identifica su propio número.
TAIL_LENGTH = 4

_NON_DIGITS = re.compile(r"\D")


def mask_phone(phone: str | None) -> str:
    """
    Enmascara un teléfono conservando los dos primeros dígitos y los últimos cuatro.

        +5215512345678 -> +52*******5678
        5512345678     -> 55****5678
        +521234        -> +******
        (vacío)        -> <sin número>

    El enmascarado es determinista: si conoces el número, puedes calcular su forma
    enmascarada y seguir buscándolo en los logs.
    """
    if not phone or not isinstance(phone, str):
        return "<sin número>"

    trimmed = phone.strip()
    if not trimmed:
        return "<sin número>"

    plus = "+" if trimmed.startswith("+") else ""
    digits = _NON_DIGITS.sub("", trimmed)
    if not digits:
        return "<número inválido>"

    # Sin dígitos de sobra entre el prefijo y la cola, conservar ambos equivaldría a
    # publicar el número entero. En ese caso se oculta completo.
    if len(digits) <= PREFIX_LENGTH + TAIL_LENGTH:
        return f"{plus}{'*' * len(digits)}"

    hidden = "*" * (len(digits) - PREFIX_LENGTH - TAIL_LENGTH)
    return f"{plus}{digits[:PREFIX_LENGTH]}{hidden}{digits[-TAIL_LENGTH:]}"

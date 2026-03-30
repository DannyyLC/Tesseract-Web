"""
Internal authentication dependency for the Agents service.

All routes require a valid X-Internal-Token header that matches
the AGENTS_INTERNAL_SECRET environment variable.

If AGENTS_INTERNAL_SECRET is not set the check is skipped, allowing
local development without any additional configuration.
"""

import hmac
import os
from typing import Optional

from fastapi import Header, HTTPException, status


async def verify_internal_token(
    x_internal_token: Optional[str] = Header(default=None),
) -> None:
    secret = os.getenv("AGENTS_INTERNAL_SECRET")

    if not secret:
        # No secret configured — dev mode, allow all requests
        return

    if not x_internal_token or not hmac.compare_digest(x_internal_token, secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
        )

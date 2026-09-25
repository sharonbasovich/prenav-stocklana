"""PreStocks public API (no key, no CORS -> always proxied through this backend)."""

from __future__ import annotations

from typing import Any

from ..config import PRESTOCKS_API
from ..http import get_json


async def list_prestocks() -> list[dict[str, Any]]:
    """GET /api/prestocks -> raw token list."""
    data = await get_json(f"{PRESTOCKS_API}/prestocks")
    if not isinstance(data, list):
        raise ValueError("unexpected /api/prestocks shape")
    return data


async def stats() -> dict[str, Any]:
    """GET /api/stats -> {volume[], holders[], launchDates{}}."""
    data = await get_json(f"{PRESTOCKS_API}/stats")
    if not isinstance(data, dict):
        raise ValueError("unexpected /api/stats shape")
    return data

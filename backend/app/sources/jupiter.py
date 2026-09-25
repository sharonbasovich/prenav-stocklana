"""Jupiter lite-api (keyless, CORS-open)."""

from __future__ import annotations

from typing import Any

from ..config import JUPITER_API
from ..http import get_json


async def prices(mints: list[str]) -> dict[str, dict[str, Any]]:
    """GET /price/v3?ids=... -> {mint: {usdPrice, liquidity, priceChange24h, stockData, scaledUiConfig}}."""
    if not mints:
        return {}
    data = await get_json(f"{JUPITER_API}/price/v3", params={"ids": ",".join(mints)})
    if not isinstance(data, dict):
        raise ValueError("unexpected jupiter price shape")
    return data


async def token_meta(mint: str) -> dict[str, Any] | None:
    """GET /tokens/v2/search?query=<mint> -> token metadata (holderCount, authorities...)."""
    data = await get_json(f"{JUPITER_API}/tokens/v2/search", params={"query": mint})
    if isinstance(data, list) and data:
        return data[0]
    return None

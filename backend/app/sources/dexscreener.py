"""DexScreener (keyless, CORS-open)."""

from __future__ import annotations

from typing import Any

from ..config import DEXSCREENER_API
from ..http import get_json


async def token_pairs(mints: list[str]) -> dict[str, list[dict[str, Any]]]:
    """GET /tokens/<comma-sep mints> -> {mint: pairs[]}.

    DexScreener accepts up to ~30 comma-separated addresses in one call.
    """
    if not mints:
        return {}
    data = await get_json(f"{DEXSCREENER_API}/tokens/{','.join(mints)}")
    pairs = data.get("pairs") or [] if isinstance(data, dict) else []
    out: dict[str, list[dict[str, Any]]] = {m: [] for m in mints}
    for p in pairs:
        base = (p.get("baseToken") or {}).get("address")
        if base in out:
            out[base].append(p)
    return out

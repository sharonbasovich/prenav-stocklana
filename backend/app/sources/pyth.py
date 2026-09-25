"""Pyth Hermes (OPTIONAL: only active when PYTH_API_KEY is set)."""

from __future__ import annotations

from typing import Any

from ..config import PYTH_API_KEY, PYTH_FEEDS, PYTH_HERMES_URL
from ..http import get_client


def enabled() -> bool:
    return bool(PYTH_API_KEY)


async def latest_price(symbol: str) -> dict[str, Any] | None:
    """Latest Pyth pre-IPO index price for a symbol, or None if disabled/missing."""
    feed_id = PYTH_FEEDS.get(symbol)
    if not enabled() or not feed_id:
        return None
    resp = await get_client().get(
        f"{PYTH_HERMES_URL}/v2/updates/price/latest",
        params=[("ids[]", feed_id), ("parsed", "true")],
        headers={"Authorization": f"Bearer {PYTH_API_KEY}"},
    )
    resp.raise_for_status()
    data = resp.json()
    parsed = data.get("parsed") or []
    if not parsed:
        return None
    price_obj = parsed[0].get("price") or {}
    expo = int(price_obj.get("expo", 0))
    raw = int(price_obj.get("price", 0))
    return {
        "price": raw * (10**expo),
        "publishTime": int(price_obj.get("publish_time", 0)),
        "feedId": feed_id,
    }

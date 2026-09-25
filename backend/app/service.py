"""Aggregation layer: combines upstream sources into API payloads with
TTL caching, last-good snapshots, and stale-fallback semantics."""

from __future__ import annotations

import asyncio
import logging
import statistics
import time
from typing import Any

from . import db
from .config import FALLBACK_TOKENS
from .sources import dexscreener, jupiter, prestocks, pyth, solana_rpc
from .token2022 import current_multiplier, decode_safety

log = logging.getLogger("prenav")

TTL_PRESTOCKS = 60
TTL_STATS = 300
TTL_PRICES = 60
TTL_POOLS = 300
TTL_MINT = 600
TTL_EPOCH = 60

_cache: dict[str, tuple[float, Any]] = {}
SOURCE_STATUS: dict[str, dict[str, Any]] = {}

BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _cached(key: str) -> Any | None:
    hit = _cache.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    return None


def _store(key: str, value: Any, ttl: int) -> Any:
    _cache[key] = (time.time() + ttl, value)
    return value


def _mark_source(name: str, ok: bool, err: str | None = None) -> None:
    SOURCE_STATUS[name] = {"ok": ok, "err": err, "ts": int(time.time())}


def decode_base58(s: str) -> bytes | None:
    if not s or len(s) > 44:
        return None
    num = 0
    for ch in s:
        idx = BASE58_ALPHABET.find(ch)
        if idx < 0:
            return None
        num = num * 58 + idx
    b = num.to_bytes((num.bit_length() + 7) // 8, "big") if num else b""
    pad = len(s) - len(s.lstrip("1"))
    return b"\x00" * pad + b


def valid_address(s: str) -> bool:
    decoded = decode_base58(s)
    return decoded is not None and len(decoded) == 32


# ---------------------------------------------------------------- sources


async def fetch_prestocks_list() -> tuple[list[dict[str, Any]], bool]:
    """-> (token list, stale). Falls back to last-good snapshot, then static table."""
    fresh = _cached("prestocks_list")
    if fresh is not None:
        return fresh, False
    try:
        data = await prestocks.list_prestocks()
        db.kv_set("prestocks_list", data)
        _mark_source("prestocks", True)
        return _store("prestocks_list", data, TTL_PRESTOCKS), False
    except Exception as exc:  # noqa: BLE001 - fallback path must catch all
        _mark_source("prestocks", False, str(exc))
        cached = db.kv_get("prestocks_list")
        if cached:
            log.warning("prestocks api down; serving cached snapshot: %s", exc)
            return _store("prestocks_list", cached, TTL_PRESTOCKS), True
        log.warning("prestocks api down and no snapshot; using static table: %s", exc)
        return FALLBACK_TOKENS, True


async def fetch_stats() -> tuple[dict[str, Any], bool]:
    fresh = _cached("stats")
    if fresh is not None:
        return fresh, False
    try:
        data = await prestocks.stats()
        db.kv_set("stats", data)
        _mark_source("prestocks_stats", True)
        return _store("stats", data, TTL_STATS), False
    except Exception as exc:  # noqa: BLE001
        _mark_source("prestocks_stats", False, str(exc))
        cached = db.kv_get("stats")
        if cached:
            return _store("stats", cached, TTL_STATS), True
        return {"volume": [], "holders": [], "launchDates": {}}, True


async def fetch_prices(mints: list[str]) -> tuple[dict[str, Any], bool]:
    fresh = _cached("jup_prices")
    if fresh is not None:
        return fresh, False
    try:
        data = await jupiter.prices(mints)
        db.kv_set("jup_prices", data)
        _mark_source("jupiter", True)
        return _store("jup_prices", data, TTL_PRICES), False
    except Exception as exc:  # noqa: BLE001
        _mark_source("jupiter", False, str(exc))
        cached = db.kv_get("jup_prices")
        if cached:
            return _store("jup_prices", cached, TTL_PRICES), True
        return {}, True


async def fetch_pairs(mints: list[str]) -> tuple[dict[str, list[dict[str, Any]]], bool]:
    fresh = _cached("dex_pairs")
    if fresh is not None:
        return fresh, False
    try:
        data = await dexscreener.token_pairs(mints)
        db.kv_set("dex_pairs", data)
        _mark_source("dexscreener", True)
        return _store("dex_pairs", data, TTL_POOLS), False
    except Exception as exc:  # noqa: BLE001
        _mark_source("dexscreener", False, str(exc))
        cached = db.kv_get("dex_pairs")
        if cached:
            return _store("dex_pairs", cached, TTL_POOLS), True
        return {m: [] for m in mints}, True


async def fetch_mint_account(mint: str) -> tuple[dict[str, Any] | None, bool]:
    key = f"mint:{mint}"
    fresh = _cached(key)
    if fresh is not None:
        return fresh, False
    try:
        data = await solana_rpc.get_account_info_parsed(mint)
        if data:
            db.kv_set(key, data)
        _mark_source("rpc", True)
        return _store(key, data, TTL_MINT), False
    except Exception as exc:  # noqa: BLE001
        _mark_source("rpc", False, str(exc))
        cached = db.kv_get(key)
        if cached:
            return _store(key, cached, TTL_MINT), True
        return None, True


async def fetch_epoch() -> int | None:
    fresh = _cached("epoch")
    if fresh is not None:
        return fresh
    try:
        info = await solana_rpc.get_epoch_info()
        if info and info.get("epoch") is not None:
            return _store("epoch", int(info["epoch"]), TTL_EPOCH)
    except Exception:  # noqa: BLE001 - epoch is optional refinement
        pass
    return None


# ---------------------------------------------------------------- payloads


def _token_row(
    item: dict[str, Any],
    price_entry: dict[str, Any] | None,
    pairs: list[dict[str, Any]],
    stats_map: dict[str, Any],
) -> dict[str, Any]:
    symbol = item.get("symbol", "")
    mint = item.get("contract_address") or item.get("mint") or ""
    mark = item.get("markPrice")
    if mark is None and price_entry:
        mark = (price_entry.get("stockData") or {}).get("price")  # Jupiter carries the PreStocks mark
    dex = None
    if price_entry:
        dex = price_entry.get("usdPrice")
    if dex is None:
        dex = item.get("tokenPrice")  # PreStocks' own DEX price as fallback
    liquidity = (price_entry or {}).get("liquidity")
    vol24 = sum((p.get("volume") or {}).get("h24") or 0 for p in pairs) or None
    premium = (dex / mark - 1) * 100 if (dex and mark) else None
    return {
        "symbol": symbol,
        "name": item.get("name"),
        "description": item.get("description"),
        "image": item.get("image"),
        "externalUrl": item.get("external_url"),
        "mint": mint,
        "mark": mark,
        "dex": dex,
        "premiumPct": premium,
        "liquidityUsd": liquidity,
        "vol24hUsd": vol24,
        "holders": stats_map.get("holders"),
        "launchDate": stats_map.get("launchDate"),
        "implVal": item.get("impliedValuation"),
        "markVal": item.get("markValuation"),
        "supply": item.get("supply"),
        "priceChange24h": (price_entry or {}).get("priceChange24h"),
    }


def _stats_maps(stats_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """symbol -> {holders (latest week), launchDate}"""
    out: dict[str, dict[str, Any]] = {}
    holders_rows = stats_data.get("holders") or []
    if holders_rows:
        last = holders_rows[-1]
        for sym, val in last.items():
            if sym != "week":
                out.setdefault(sym, {})["holders"] = val
    for sym, dt in (stats_data.get("launchDates") or {}).items():
        out.setdefault(sym, {})["launchDate"] = dt
    return out


async def tokens_payload(sort: str | None = None) -> tuple[list[dict[str, Any]], bool]:
    (items, s1), (stats_data, s2) = await asyncio.gather(fetch_prestocks_list(), fetch_stats())
    mints = [i.get("contract_address") for i in items if i.get("contract_address")]
    (prices, s3), (pairs_map, s4) = await asyncio.gather(fetch_prices(mints), fetch_pairs(mints))
    stats_map = _stats_maps(stats_data)
    rows = [
        _token_row(
            i,
            prices.get(i.get("contract_address")),
            pairs_map.get(i.get("contract_address"), []),
            stats_map.get(i.get("symbol"), {}),
        )
        for i in items
    ]
    if sort == "premium":
        rows.sort(key=lambda r: (r["premiumPct"] is None, -(r["premiumPct"] or 0)))
    return rows, any([s1, s2, s3, s4])


def _pool_rows(pairs: list[dict[str, Any]], multiplier: float) -> tuple[list[dict[str, Any]], float]:
    """-> (pool rows, dispersionPct). Prices normalized to scaled (display) units."""
    usable = []
    for p in pairs:
        price_raw = _f(p.get("priceUsd"))
        liq = _f((p.get("liquidity") or {}).get("usd")) or 0.0
        if price_raw is None or liq < 1000:
            continue
        usable.append(p)
    if not usable:
        return [], 0.0
    raw_prices = [_f(p.get("priceUsd")) for p in usable if _f(p.get("priceUsd")) is not None]
    mid = statistics.median(raw_prices)
    lo, hi = min(raw_prices), max(raw_prices)
    dispersion = (hi - lo) / mid * 100 if mid else 0.0
    usable.sort(key=lambda p: -((p.get("liquidity") or {}).get("usd") or 0))
    rows = []
    for p in usable[:15]:
        raw = _f(p.get("priceUsd"))
        rows.append(
            {
                "dex": p.get("dexId"),
                "pair": p.get("pairAddress"),
                "url": p.get("url"),
                "priceUsd": raw / multiplier if raw is not None else None,
                "priceUsdRaw": raw,
                "liqUsd": _f((p.get("liquidity") or {}).get("usd")),
                "vol24h": _f((p.get("volume") or {}).get("h24")),
                "devFromMidPct": (raw / mid - 1) * 100 if (raw is not None and mid) else None,
            }
        )
    return rows, dispersion


def _f(v: Any) -> float | None:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


async def token_payload(symbol: str) -> tuple[dict[str, Any] | None, bool]:
    symbol = symbol.upper()
    items, s1 = await fetch_prestocks_list()
    item = next((i for i in items if (i.get("symbol") or "").upper() == symbol), None)
    if not item:
        return None, s1
    mint = item.get("contract_address")
    (prices, s3), (pairs_map, s4), (acct, s5), (stats_data, s2), epoch = await asyncio.gather(
        fetch_prices([mint]),
        fetch_pairs([mint]),
        fetch_mint_account(mint),
        fetch_stats(),
        fetch_epoch(),
    )
    price_entry = prices.get(mint)
    scaled_cfg = None
    if acct:
        exts = ((acct.get("data") or {}).get("parsed") or {}).get("info", {}).get("extensions") or []
        scaled_cfg = next((e.get("state") for e in exts if e.get("extension") == "scaledUiAmountConfig"), None)
    mult = current_multiplier(scaled_cfg) if scaled_cfg else 1.0
    pairs = pairs_map.get(mint, [])
    pools, dispersion = _pool_rows(pairs, mult)
    row = _token_row(item, price_entry, pairs, _stats_maps(stats_data).get(symbol, {}))
    safety = decode_safety(acct, epoch) if acct else None
    pyth_data = None
    try:
        p = await pyth.latest_price(symbol)
        if p and row["dex"]:
            pyth_data = {**p, "premiumPct": (row["dex"] / p["price"] - 1) * 100}
    except Exception:  # noqa: BLE001
        pass
    row["safety"] = safety
    row["pools"] = pools
    row["dispersionPct"] = dispersion
    if pyth_data:
        row["pyth"] = pyth_data
    return row, any([s1, s2, s3, s4, s5])


async def history_payload(symbol: str) -> tuple[dict[str, Any] | None, bool]:
    symbol = symbol.upper()
    items, s1 = await fetch_prestocks_list()
    item = next((i for i in items if (i.get("symbol") or "").upper() == symbol), None)
    if not item:
        return None, s1
    stats_data, s2 = await fetch_stats()
    volume_daily = [{"date": r.get("date"), "value": r.get(symbol)} for r in (stats_data.get("volume") or []) if symbol in r]
    holders_weekly = [{"week": r.get("week"), "value": r.get(symbol)} for r in (stats_data.get("holders") or []) if symbol in r]
    return (
        {
            "premium": db.premium_history(symbol),
            "volumeDaily": volume_daily,
            "holdersWeekly": holders_weekly,
        },
        any([s1, s2]),
    )


async def portfolio_payload(address: str) -> tuple[dict[str, Any], bool]:
    items, s1 = await fetch_prestocks_list()
    by_mint = {i.get("contract_address"): i for i in items if i.get("contract_address")}
    mints = list(by_mint)
    (accounts_result, s_rpc), (prices, s3) = await asyncio.gather(_fetch_owner_accounts(address), fetch_prices(mints))
    # decode mint multipliers (cached; parallel)
    mults = await asyncio.gather(*[_mint_multiplier(by_mint[m]) for m in mints])
    mult_map = dict(zip(mints, mults, strict=True))
    positions = []
    for acct in accounts_result:
        info = ((acct.get("account") or {}).get("data") or {}).get("parsed", {}).get("info") or {}
        mint = info.get("mint")
        if mint not in by_mint:
            continue
        token_amount = info.get("tokenAmount") or {}
        ui = _f(token_amount.get("uiAmount")) or 0.0
        if ui <= 0:
            continue
        item = by_mint[mint]
        symbol = item.get("symbol")
        mult = mult_map.get(mint) or 1.0
        units = ui * mult  # display (scaled) units, matching DEX price scale
        pe = prices.get(mint) or {}
        dex = pe.get("usdPrice") or item.get("tokenPrice")
        mark = item.get("markPrice")
        market_value = units * dex if dex else None
        nav_value = units * mark if mark else None
        premium_exposure = market_value - nav_value if (market_value is not None and nav_value is not None) else None
        safety = None
        acct_data, _ = await fetch_mint_account(mint)
        if acct_data:
            safety = decode_safety(acct_data, await fetch_epoch())
        fee_bps = (safety or {}).get("transferFeeBps") or 0
        exit_fee = market_value * fee_bps / 10000 if market_value is not None else None
        liq = pe.get("liquidity")
        positions.append(
            {
                "symbol": symbol,
                "name": item.get("name"),
                "image": item.get("image"),
                "mint": mint,
                "tokenAccount": acct.get("pubkey"),
                "units": units,
                "dex": dex,
                "mark": mark,
                "marketValue": market_value,
                "navValue": nav_value,
                "premiumExposureUsd": premium_exposure,
                "premiumPct": (dex / mark - 1) * 100 if (dex and mark) else None,
                "exitFeeUsd": exit_fee,
                "exitFeeBps": fee_bps,
                "poolDepthUsd": liq,
                "exitWarning": market_value is not None and liq is not None and market_value > liq * 0.10,
            }
        )
    positions.sort(key=lambda p: -(p["marketValue"] or 0))
    totals = {
        "marketValue": sum(p["marketValue"] or 0 for p in positions),
        "navValue": sum(p["navValue"] or 0 for p in positions),
        "premiumExposureUsd": sum(p["premiumExposureUsd"] or 0 for p in positions),
        "exitFeeUsd": sum(p["exitFeeUsd"] or 0 for p in positions),
    }
    totals["premiumPct"] = (totals["marketValue"] / totals["navValue"] - 1) * 100 if totals["navValue"] else None
    return {"address": address, "positions": positions, "totals": totals}, any([s1, s3, s_rpc])


async def _fetch_owner_accounts(address: str) -> tuple[list[dict[str, Any]], bool]:
    try:
        data = await solana_rpc.get_token_accounts_by_owner(address)
        _mark_source("rpc", True)
        return data, False
    except Exception as exc:  # noqa: BLE001
        _mark_source("rpc", False, str(exc))
        return [], True


async def _mint_multiplier(item: dict[str, Any]) -> float:
    acct, _ = await fetch_mint_account(item["contract_address"])
    if not acct:
        return 1.0
    exts = ((acct.get("data") or {}).get("parsed") or {}).get("info", {}).get("extensions") or []
    cfg = next((e.get("state") for e in exts if e.get("extension") == "scaledUiAmountConfig"), None)
    return current_multiplier(cfg) if cfg else 1.0


# ---------------------------------------------------------------- sampler


async def sample_once() -> None:
    """One sampler tick: mark + dex price per token -> premium_samples."""
    try:
        items, _ = await fetch_prestocks_list()
        mints = [i.get("contract_address") for i in items if i.get("contract_address")]
        prices, _ = await fetch_prices(mints)
        ts = int(time.time())
        rows = []
        for i in items:
            mint = i.get("contract_address")
            mark = _f(i.get("markPrice"))
            pe = prices.get(mint) or {}
            dex = _f(pe.get("usdPrice")) or _f(i.get("tokenPrice"))
            premium = (dex / mark - 1) * 100 if (dex and mark) else None
            rows.append((ts, i.get("symbol", "?"), mark, dex, premium))
        db.insert_samples(rows)
        log.info("sampler: %d rows @%d", len(rows), ts)
    except Exception as exc:  # noqa: BLE001
        log.warning("sampler tick failed: %s", exc)

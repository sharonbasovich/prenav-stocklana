"""Shared httpx client with retry/backoff for rate limits."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

_client: httpx.AsyncClient | None = None
_client_loop: asyncio.AbstractEventLoop | None = None


def get_client() -> httpx.AsyncClient:
    """Shared client, one per running event loop (tests swap loops)."""
    global _client, _client_loop
    loop = asyncio.get_running_loop()
    if _client is None or _client_loop is not loop:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(20.0),
            headers={"User-Agent": "prenav/0.1 (+https://github.com/sharonbasovich/norththehackers)"},
            follow_redirects=True,
        )
        _client_loop = loop
    return _client


async def close_client() -> None:
    global _client, _client_loop
    if _client is not None:
        loop = asyncio.get_running_loop()
        if _client_loop is loop and not loop.is_closed():
            await _client.aclose()
        _client = None
        _client_loop = None


class UpstreamError(Exception):
    """An upstream source failed after retries."""


async def get_json(url: str, *, retries: int = 2, params: dict[str, Any] | None = None) -> Any:
    """GET JSON with backoff on 429/5xx."""
    delay = 0.5
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            resp = await get_client().get(url, params=params)
            if resp.status_code == 429 or resp.status_code >= 500:
                raise UpstreamError(f"GET {url} -> {resp.status_code}")
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPError, UpstreamError) as exc:
            last_exc = exc
            if attempt < retries:
                await asyncio.sleep(delay)
                delay *= 2
    raise UpstreamError(f"GET {url} failed: {last_exc}")


async def rpc_call(method: str, params: list[Any], *, retries: int = 3, rpc_url: str | None = None) -> Any:
    """JSON-RPC call with backoff on HTTP 429/5xx and retryable JSON-RPC errors."""
    from .config import SOLANA_RPC_URL

    url = rpc_url or SOLANA_RPC_URL
    delay = 1.0
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            resp = await get_client().post(
                url,
                json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
            )
            if resp.status_code == 429 or resp.status_code >= 500:
                raise UpstreamError(f"rpc {method} -> HTTP {resp.status_code}")
            resp.raise_for_status()
            body = resp.json()
            if "error" in body:
                code = body["error"].get("code", 0)
                raise UpstreamError(f"rpc {method} -> jsonrpc error {code}: {body['error'].get('message')}")
            return body.get("result")
        except (httpx.HTTPError, UpstreamError) as exc:
            last_exc = exc
            if attempt < retries:
                await asyncio.sleep(delay)
                delay *= 2
    raise UpstreamError(f"rpc {method} failed: {last_exc}")

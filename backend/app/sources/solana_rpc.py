"""Solana mainnet JSON-RPC (public endpoint by default; SOLANA_RPC_URL optional)."""

from __future__ import annotations

from typing import Any

from ..config import SOLANA_RPC_URL, TOKEN_2022_PROGRAM
from ..http import rpc_call


async def get_account_info_parsed(mint: str, rpc_url: str | None = None) -> dict[str, Any] | None:
    result = await rpc_call(
        "getAccountInfo",
        [mint, {"encoding": "jsonParsed"}],
        rpc_url=rpc_url or SOLANA_RPC_URL,
    )
    if not result:
        return None
    return result.get("value")


async def get_epoch_info(rpc_url: str | None = None) -> dict[str, Any] | None:
    result = await rpc_call("getEpochInfo", [], rpc_url=rpc_url or SOLANA_RPC_URL)
    return result if isinstance(result, dict) else None


async def get_token_accounts_by_owner(owner: str, rpc_url: str | None = None) -> list[dict[str, Any]]:
    result = await rpc_call(
        "getTokenAccountsByOwner",
        [owner, {"programId": TOKEN_2022_PROGRAM}, {"encoding": "jsonParsed"}],
        rpc_url=rpc_url or SOLANA_RPC_URL,
    )
    if not result:
        return []
    return result.get("value") or []

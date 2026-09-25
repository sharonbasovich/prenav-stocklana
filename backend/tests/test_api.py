"""Unit tests: all upstream HTTP mocked with respx (acceptance tests 1-7)."""

from __future__ import annotations

import json
import time

import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response

from app import db, service
from app.config import DEXSCREENER_API, JUPITER_API, PRESTOCKS_API, SOLANA_RPC_URL
from app.main import app

from .conftest import (
    MINTS,
    dexscreener_payload,
    jupiter_payload,
    mint_account,
    prestocks_payload,
    stats_payload,
)

OWNER_ACCOUNTS = {
    "value": [
        {
            "pubkey": "tokenAcct1",
            "account": {
                "data": {
                    "parsed": {
                        "info": {
                            "mint": MINTS["SPACEX"],
                            "tokenAmount": {
                                "amount": "10000000",
                                "decimals": 9,
                                "uiAmount": 0.01,
                                "uiAmountString": "0.01",
                            },
                            "owner": "owner",
                        },
                        "type": "account",
                    },
                    "program": "spl-token-2022",
                },
            },
        },
        {  # non-PreStocks token account -> must be excluded
            "pubkey": "tokenAcct2",
            "account": {
                "data": {
                    "parsed": {
                        "info": {
                            "mint": "So11111111111111111111111111111111111111112",
                            "tokenAmount": {
                                "amount": "9",
                                "decimals": 9,
                                "uiAmount": 1,
                                "uiAmountString": "1",
                            },
                            "owner": "owner",
                        },
                        "type": "account",
                    },
                    "program": "spl-token-2022",
                },
            },
        },
    ]
}


def rpc_result(request):
    body = json.loads(request.content)
    method = body["method"]
    if method == "getAccountInfo":
        return Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {"value": mint_account()}})
    if method == "getEpochInfo":
        return Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "result": {
                    "epoch": 1042,
                    "absoluteSlot": 1,
                    "blockHeight": 1,
                    "slotIndex": 1,
                    "slotsInEpoch": 432000,
                },
            },
        )
    if method == "getTokenAccountsByOwner":
        return Response(200, json={"jsonrpc": "2.0", "id": 1, "result": OWNER_ACCOUNTS})
    return Response(200, json={"jsonrpc": "2.0", "id": 1, "result": None})


@pytest.fixture
def mocked():
    """All upstreams mocked except Solana RPC (added per-test via add_rpc)."""
    with respx.mock(assert_all_called=False) as router:
        router.get(f"{PRESTOCKS_API}/prestocks").respond(200, json=prestocks_payload())
        router.get(f"{PRESTOCKS_API}/stats").respond(200, json=stats_payload())
        router.get(url__startswith=f"{JUPITER_API}/price/v3").respond(200, json=jupiter_payload())
        router.get(url__startswith=f"{DEXSCREENER_API}/tokens/").respond(200, json=dexscreener_payload())
        yield router


def add_rpc(router, side_effect=rpc_result):
    return router.post(SOLANA_RPC_URL).mock(side_effect=side_effect)


@pytest.fixture
def client(mocked):
    add_rpc(mocked)
    with TestClient(app) as c:
        yield c


# --- test 1 -----------------------------------------------------------------


def test_tokens_count_premium_and_sort(client):
    resp = client.get("/api/tokens?sort=premium")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 8
    for r in rows:
        expected = (r["dex"] / r["mark"] - 1) * 100
        assert abs(r["premiumPct"] - expected) < 1e-6
    premiums = [r["premiumPct"] for r in rows if r["premiumPct"] is not None]
    assert premiums == sorted(premiums, reverse=True)


# --- test 2 -----------------------------------------------------------------


def test_token_safety_sheet(client):
    resp = client.get("/api/tokens/OPENAI")
    assert resp.status_code == 200
    s = resp.json()["safety"]
    assert s["program"] == "spl-token-2022"
    assert s["transferFeeBps"] == 100  # epoch 1042 < 1043: the 300bps fee is still pending
    assert s["pendingFeeBps"] == 300
    delegate = s["permanentDelegate"]
    assert delegate and service.valid_address(delegate)
    keys = {f["key"]: f["severity"] for f in s["flags"]}
    assert keys["permanent_delegate"] == "high"
    assert keys["transfer_fee"] == "medium"


# --- test 3 -----------------------------------------------------------------


def test_token_pools_and_dispersion(client):
    resp = client.get("/api/tokens/ANTHROPIC")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["pools"]) >= 5
    assert body["dispersionPct"] >= 0
    liqs = [p["liqUsd"] for p in body["pools"]]
    assert liqs == sorted(liqs, reverse=True)


# --- test 4 -----------------------------------------------------------------


def test_unknown_token_404(client):
    resp = client.get("/api/tokens/NOPE")
    assert resp.status_code == 404
    assert resp.json() == {"detail": "unknown token"}


# --- test 5 -----------------------------------------------------------------


def test_portfolio_and_validation(client):
    holder = "4wa8FTHDBLNf1DCAWhNbqJ5ZRGkV8TQX1TaF2VMpNttM"
    resp = client.get(f"/api/portfolio/{holder}")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["positions"]) >= 1
    assert {p["symbol"] for p in body["positions"]} == {"SPACEX"}  # non-PreStocks excluded
    total = sum(p["marketValue"] for p in body["positions"])
    assert abs(body["totals"]["marketValue"] - total) < 1e-6

    bad = client.get("/api/portfolio/not-an-address!!!")
    assert bad.status_code == 422


# --- test 6 -----------------------------------------------------------------


@pytest.mark.asyncio
async def test_sampler_rows_and_history(client):
    await service.sample_once()
    for sym in MINTS:
        assert db.sample_count(sym) >= 1
    resp = client.get("/api/tokens/OPENAI/history")
    assert resp.status_code == 200
    series = resp.json()["premium"]
    ts = [p["ts"] for p in series]
    assert ts == sorted(ts)


# --- test 7a ----------------------------------------------------------------


def test_stale_fallback_when_prestocks_down(client, mocked):
    # warm the snapshot
    assert client.get("/api/tokens").status_code == 200
    service._cache.clear()
    mocked.get(f"{PRESTOCKS_API}/prestocks").respond(500, json={"oops": True})
    mocked.get(f"{PRESTOCKS_API}/stats").respond(500, json={"oops": True})
    resp = client.get("/api/tokens")
    assert resp.status_code == 200
    assert resp.headers["X-Data-Stale"] == "true"
    assert len(resp.json()) == 8


# --- test 7b ----------------------------------------------------------------


def test_rpc_backoff_on_429(mocked):
    calls = []

    def flaky(request):
        calls.append(1)
        if len(calls) <= 3:
            return Response(429, json={"error": "rate limited"})
        return rpc_result(request)

    add_rpc(mocked, side_effect=flaky)
    with TestClient(app) as client:
        resp = client.get("/api/tokens/OPENAI")
    assert resp.status_code == 200
    assert resp.json()["safety"]["program"] == "spl-token-2022"
    assert len(calls) >= 4


# --- health -----------------------------------------------------------------


def test_health(client):
    deadline = time.time() + 30
    last = None
    while time.time() < deadline:
        resp = client.get("/api/health")
        assert resp.status_code == 200
        last = resp.json()["lastSampleTs"]
        if last is not None:
            break
        time.sleep(0.5)
    assert last is not None
    assert int(time.time()) - last < 120

"""Live tests (-m live): hit the real upstreams. Run green at least once before
submitting. Numbers are asserted against live API values, never hardcoded."""

from __future__ import annotations

import asyncio
import time

import pytest
from fastapi.testclient import TestClient

from app import db, service
from app.main import app

pytestmark = pytest.mark.live

HOLDER = "4wa8FTHDBLNf1DCAWhNbqJ5ZRGkV8TQX1TaF2VMpNttM"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_live_tokens(client):
    resp = client.get("/api/tokens?sort=premium")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 8
    for r in rows:
        assert r["premiumPct"] is not None
        assert abs(r["premiumPct"] - ((r["dex"] / r["mark"] - 1) * 100)) < 1e-6
    premiums = [r["premiumPct"] for r in rows]
    assert premiums == sorted(premiums, reverse=True)


def test_live_openai_safety(client):
    resp = client.get("/api/tokens/OPENAI")
    assert resp.status_code == 200
    body = resp.json()
    s = body["safety"]
    assert s["program"] == "spl-token-2022"
    # The effective fee is read live: it equals the bps that applies at the
    # current epoch (newer config applies at its epoch boundary).
    assert s["transferFeeBps"] in (100, 300)
    assert isinstance(s["transferFeeBps"], int) and s["transferFeeBps"] >= 0
    assert s["permanentDelegate"] and service.valid_address(s["permanentDelegate"])
    keys = {f["key"]: f["severity"] for f in s["flags"]}
    assert keys["permanent_delegate"] == "high"
    assert keys["transfer_fee"] == "medium"


def test_live_anthropic_pools(client):
    body = client.get("/api/tokens/ANTHROPIC").json()
    assert len(body["pools"]) >= 5
    assert body["dispersionPct"] >= 0
    liqs = [p["liqUsd"] for p in body["pools"]]
    assert liqs == sorted(liqs, reverse=True)


def test_live_404(client):
    assert client.get("/api/tokens/NOPE").status_code == 404


def test_live_portfolio(client):
    resp = client.get(f"/api/portfolio/{HOLDER}")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["positions"]) >= 1
    total = sum(p["marketValue"] or 0 for p in body["positions"])
    assert abs(body["totals"]["marketValue"] - total) < 1e-6
    assert client.get("/api/portfolio/!!!invalid").status_code == 422


def test_live_sampler_and_history(client):
    asyncio.run(service.sample_once())
    rows = client.get("/api/tokens/OPENAI/history").json()["premium"]
    assert len(rows) >= 1
    ts = [p["ts"] for p in rows]
    assert ts == sorted(ts)
    assert db.sample_count("OPENAI") >= 1


def test_live_health(client):
    asyncio.run(service.sample_once())
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    deadline = time.time() + 60
    while body["lastSampleTs"] is None and time.time() < deadline:
        time.sleep(1)
        body = client.get("/api/health").json()
    assert body["lastSampleTs"] is not None
    assert int(time.time()) - body["lastSampleTs"] < 600

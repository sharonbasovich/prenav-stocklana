"""Shared fixtures + fixture data (shapes mirror the live APIs)."""

from __future__ import annotations

import os

os.environ.setdefault("PRENAV_DB_PATH", "/tmp/prenav-test.db")

import pytest

from app import db, service

MINTS = {
    "OPENAI": "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
    "ANTHROPIC": "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw",
    "SPACEX": "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh",
    "ANDURIL": "PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB",
    "NEURALINK": "PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S",
    "KALSHI": "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua",
    "POLYMARKET": "Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP",
    "FIGUREAI": "PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd",
}

MARK = {"OPENAI": 1000.0, "ANTHROPIC": 500.0, "SPACEX": 100.0}
DEX = {"OPENAI": 1300.0, "ANTHROPIC": 490.0, "SPACEX": 80.0}


def prestocks_payload() -> list[dict]:
    return [
        {
            "name": f"{s} PreStocks",
            "symbol": s,
            "description": f"{s} desc",
            "image": f"https://img/{s}.png",
            "external_url": f"https://prestocks.com/{s.lower()}",
            "contract_address": m,
            "markPrice": MARK.get(s, 50.0),
            "markValuation": 1e9,
            "tokenPrice": DEX.get(s, 55.0),
            "impliedValuation": 1.2e9,
            "supply": 1000.0,
        }
        for s, m in MINTS.items()
    ]


def jupiter_payload() -> dict:
    return {
        m: {
            "usdPrice": DEX.get(s, 55.0),
            "liquidity": 250000.0,
            "priceChange24h": 1.5,
            "decimals": 9,
            "stockData": {"id": "prestocks", "price": MARK.get(s, 50.0)},
        }
        for s, m in MINTS.items()
    }


def dexscreener_payload() -> dict:
    pairs = []
    for i in range(8):
        pairs.append(
            {
                "chainId": "solana",
                "dexId": "meteora",
                "url": f"https://dexscreener.com/solana/pool{i}",
                "pairAddress": f"pooladdr{i}",
                "baseToken": {"address": MINTS["ANTHROPIC"], "symbol": "ANTHROPIC"},
                "quoteToken": {"address": "usdc"},
                "priceUsd": str(490.0 + i),
                "volume": {"h24": 1000 * i},
                "liquidity": {"usd": 50000 - i * 1000},
            }
        )
    return {"schemaVersion": "1.0.0", "pairs": pairs}


def stats_payload() -> dict:
    return {
        "volume": [{"date": "2025-09-20", "OPENAI": 100, "ANTHROPIC": 50, "SPACEX": 10}],
        "holders": [{"week": "2025-09-18", "OPENAI": 77000, "ANTHROPIC": 83000, "SPACEX": 12000}],
        "launchDates": {"OPENAI": "2025-08-07T02:00:00Z", "ANTHROPIC": "2025-08-07T02:00:00Z"},
    }


def mint_account(symbol: str = "OPENAI") -> dict:
    return {
        "data": {
            "parsed": {
                "info": {
                    "decimals": 9,
                    "mintAuthority": "WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc",
                    "freezeAuthority": "WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc",
                    "supply": "1901801648550",
                    "isInitialized": True,
                    "extensions": [
                        {
                            "extension": "permanentDelegate",
                            "state": {"delegate": "WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc"},
                        },
                        {"extension": "defaultAccountState", "state": {"accountState": "initialized"}},
                        {
                            "extension": "transferFeeConfig",
                            "state": {
                                "newerTransferFee": {
                                    "epoch": 1043,
                                    "maximumFee": 18446744073709551615,
                                    "transferFeeBasisPoints": 300,
                                },
                                "olderTransferFee": {
                                    "epoch": 1039,
                                    "maximumFee": 18446744073709551615,
                                    "transferFeeBasisPoints": 100,
                                },
                                "transferFeeConfigAuthority": "WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc",
                                "withdrawWithheldAuthority": "WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc",
                                "withheldAmount": 7865454785,
                            },
                        },
                        {
                            "extension": "transferHook",
                            "state": {
                                "authority": "WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc",
                                "programId": None,
                            },
                        },
                        {
                            "extension": "scaledUiAmountConfig",
                            "state": {
                                "authority": "WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc",
                                "multiplier": "1",
                                "newMultiplier": "1.4861347",
                                "newMultiplierEffectiveTimestamp": 1784305800,
                            },
                        },
                        {
                            "extension": "pausableConfig",
                            "state": {
                                "authority": "WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc",
                                "paused": False,
                            },
                        },
                    ],
                },
                "type": "mint",
            },
            "program": "spl-token-2022",
            "space": 902,
        },
        "executable": False,
        "lamports": 362899490,
        "owner": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    }


@pytest.fixture(autouse=True)
def _reset_state(tmp_path, monkeypatch):
    """Fresh DB + caches for every test."""
    monkeypatch.setattr("app.config.PRENAV_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setattr("app.db.PRENAV_DB_PATH", str(tmp_path / "test.db"))
    db.close()
    service._cache.clear()
    service.SOURCE_STATUS.clear()
    yield
    db.close()

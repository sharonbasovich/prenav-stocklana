"""Runtime configuration (env-driven; keyless by default)."""

from __future__ import annotations

import os

PRESTOCKS_API = os.environ.get("PRESTOCKS_API", "https://prestocks.com/api")
JUPITER_API = os.environ.get("JUPITER_API", "https://lite-api.jup.ag")
DEXSCREENER_API = os.environ.get("DEXSCREENER_API", "https://api.dexscreener.com/latest/dex")
SOLANA_RPC_URL = os.environ.get("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")
PYTH_HERMES_URL = os.environ.get("PYTH_HERMES_URL", "https://pyth.dourolabs.app/hermes")
PYTH_API_KEY = os.environ.get("PYTH_API_KEY", "")
PRENAV_DB_PATH = os.environ.get("PRENAV_DB_PATH", "./prenav.db")

TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"

SAMPLE_INTERVAL_SECONDS = int(os.environ.get("PRENAV_SAMPLE_INTERVAL", "300"))

# Pyth 24/7 pre-IPO index feed ids (only these two PreStocks names exist).
PYTH_FEEDS = {
    "ANTHROPIC": "5da511a7c68b17a3bc94380cab4756bc83ab87f86307af10ea58467a64b6689d",
    "OPENAI": "96d4bb23a3db78fdb72b3a03ce80ead686096f324319166534d9a27c0519c483",
}

# Static fallback for the PreStocks token list (used only when the API is down
# and no cached snapshot exists). Mirrors https://prestocks.com/api/prestocks.
FALLBACK_TOKENS = [
    {"symbol": "ANDURIL", "name": "Anduril PreStocks", "contract_address": "PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB"},
    {"symbol": "ANTHROPIC", "name": "Anthropic PreStocks", "contract_address": "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw"},
    {"symbol": "FIGUREAI", "name": "Figure AI PreStocks", "contract_address": "PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd"},
    {"symbol": "KALSHI", "name": "Kalshi PreStocks", "contract_address": "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua"},
    {"symbol": "NEURALINK", "name": "Neuralink PreStocks", "contract_address": "PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S"},
    {"symbol": "OPENAI", "name": "OpenAI PreStocks", "contract_address": "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF"},
    {"symbol": "POLYMARKET", "name": "Polymarket PreStocks", "contract_address": "Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP"},
    {"symbol": "SPACEX", "name": "SpaceX PreStocks", "contract_address": "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh"},
]

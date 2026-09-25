"""SQLite persistence: premium samples + last-good snapshots."""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from typing import Any

from .config import PRENAV_DB_PATH

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def _get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(PRENAV_DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute(
            """CREATE TABLE IF NOT EXISTS premium_samples (
                ts INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                mark REAL,
                dex REAL,
                premium_pct REAL,
                PRIMARY KEY (ts, symbol)
            )"""
        )
        _conn.execute("CREATE INDEX IF NOT EXISTS idx_samples_symbol_ts ON premium_samples(symbol, ts)")
        _conn.execute(
            """CREATE TABLE IF NOT EXISTS kv (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )"""
        )
        _conn.commit()
    return _conn


def insert_samples(rows: list[tuple[int, str, float | None, float | None, float | None]]) -> None:
    if not rows:
        return
    with _lock:
        conn = _get_conn()
        conn.executemany(
            "INSERT OR REPLACE INTO premium_samples (ts, symbol, mark, dex, premium_pct) VALUES (?,?,?,?,?)",
            rows,
        )
        conn.commit()


def premium_history(symbol: str) -> list[dict[str, Any]]:
    with _lock:
        cur = _get_conn().execute(
            "SELECT ts, mark, dex, premium_pct FROM premium_samples WHERE symbol = ? ORDER BY ts",
            (symbol,),
        )
        return [{"ts": r["ts"], "mark": r["mark"], "dex": r["dex"], "premiumPct": r["premium_pct"]} for r in cur.fetchall()]


def last_sample_ts() -> int | None:
    with _lock:
        cur = _get_conn().execute("SELECT MAX(ts) AS m FROM premium_samples")
        row = cur.fetchone()
        return int(row["m"]) if row and row["m"] is not None else None


def sample_count(symbol: str) -> int:
    with _lock:
        cur = _get_conn().execute("SELECT COUNT(*) AS c FROM premium_samples WHERE symbol = ?", (symbol,))
        return int(cur.fetchone()["c"])


def kv_set(key: str, value: Any) -> None:
    with _lock:
        conn = _get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?,?,?)",
            (key, json.dumps(value), int(time.time())),
        )
        conn.commit()


def kv_get(key: str) -> Any | None:
    with _lock:
        cur = _get_conn().execute("SELECT value FROM kv WHERE key = ?", (key,))
        row = cur.fetchone()
        return json.loads(row["value"]) if row else None


def kv_get_age(key: str) -> int | None:
    with _lock:
        cur = _get_conn().execute("SELECT updated_at FROM kv WHERE key = ?", (key,))
        row = cur.fetchone()
        return int(time.time()) - int(row["updated_at"]) if row else None


def close() -> None:
    global _conn
    if _conn is not None:
        _conn.close()
        _conn = None

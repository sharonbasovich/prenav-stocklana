"""PreNAV FastAPI app."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import db, service
from .config import SAMPLE_INTERVAL_SECONDS
from .http import close_client

logging.basicConfig(level=logging.INFO)

_scheduler: AsyncIOScheduler | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _scheduler
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(service.sample_once, "interval", seconds=SAMPLE_INTERVAL_SECONDS, id="sampler")
    _scheduler.start()
    # Fire an immediate sample in the background so first paint isn't blocked.
    asyncio.create_task(service.sample_once())
    yield
    _scheduler.shutdown(wait=False)
    await close_client()
    db.close()


app = FastAPI(title="PreNAV", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"ok": True, "lastSampleTs": db.last_sample_ts(), "sources": service.SOURCE_STATUS}


@app.get("/api/tokens")
async def list_tokens(sort: str | None = Query(default=None)):
    payload, stale = await service.tokens_payload(sort)
    return JSONResponse(payload, headers={"X-Data-Stale": "true"} if stale else {})


@app.get("/api/tokens/{symbol}")
async def get_token(symbol: str):
    payload, stale = await service.token_payload(symbol)
    if payload is None:
        raise HTTPException(status_code=404, detail="unknown token")
    return JSONResponse(payload, headers={"X-Data-Stale": "true"} if stale else {})


@app.get("/api/tokens/{symbol}/history")
async def get_token_history(symbol: str):
    payload, stale = await service.history_payload(symbol)
    if payload is None:
        raise HTTPException(status_code=404, detail="unknown token")
    return JSONResponse(payload, headers={"X-Data-Stale": "true"} if stale else {})


@app.get("/api/portfolio/{address}")
async def get_portfolio(address: str):
    if not service.valid_address(address):
        return JSONResponse({"detail": "invalid solana address"}, status_code=422)
    payload, stale = await service.portfolio_payload(address)
    return JSONResponse(payload, headers={"X-Data-Stale": "true"} if stale else {})

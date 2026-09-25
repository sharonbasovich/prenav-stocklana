# PreNAV source snapshot — status
Public source: https://github.com/sharonbasovich/prenav-stocklana
Live static demo: https://dist-oxrjakkt.devinapps.com
Tests reported by Devin at export (2026-09-25 ~05:00 UTC):
- backend: ruff check PASS, ruff format --check PASS, pytest 9/9 PASS, pytest -m live 7/7 PASS
- frontend: tsc -b PASS, vite build PASS (both modes), playwright 4/4 PASS
- static mode reportedly checked end-to-end in browser: screener, token page,
  portfolio. The hosted demo combines a bundled snapshot with live sources;
  displayed figures can differ from current quotes.
Deploy modes:
- Static (recommended, $0): `cd frontend && VITE_STATIC_MODE=1 npm run build`,
  host dist/ on any static host. No backend needed.
- Backend (optional, adds sampler + non-ATA holdings + stale-snapshot API):
  uvicorn app.main:app; set VITE_API_BASE at frontend build.

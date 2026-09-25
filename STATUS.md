# PreNAV source snapshot — status
Commits: 0c8a690..HEAD on branch devin/1790308446-prenav (local; push blocked by git-manager 403)
Test status at export (2026-09-25 ~05:00 UTC):
- backend: ruff check PASS, ruff format --check PASS, pytest 9/9 PASS, pytest -m live 7/7 PASS
- frontend: tsc -b PASS, vite build PASS (both modes), playwright 4/4 PASS
- static mode verified end-to-end in real browser: screener, token page (live
  safety sheet + pools + premium chart + stats charts), portfolio (ATA-derived).
Deploy modes:
- Static (recommended, $0): `cd frontend && VITE_STATIC_MODE=1 npm run build`,
  host dist/ on any static host. No backend needed.
- Backend (optional, adds sampler + non-ATA holdings + stale-snapshot API):
  uvicorn app.main:app; set VITE_API_BASE at frontend build.

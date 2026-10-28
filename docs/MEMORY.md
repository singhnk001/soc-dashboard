# Memory — SOC Dashboard

Running log of known issues, resolved bugs, and current system state. Update this when something changes.

---

## Current System State (Oct 2026)

| Component | Status | Notes |
|---|---|---|
| PostgreSQL `SOC_DB` | ✅ Running | localhost:5432, ~262k logs |
| FastAPI API | ✅ Running | 0.0.0.0:8001, --workers 1 |
| Next.js Frontend | ✅ Running | 0.0.0.0:3000 |
| VectorAgent (Windows Service) | ⚠️ Check | Was stopped during Oct 6 troubleshooting; may need restart |
| TI Feeds | ✅ Loaded | ~66k indicators in `threat_indicators` |

---

## Known Issues / Quirks

### API
- `init_db()` runs at module import time (not in `@app.on_event("startup")`). With `--workers 2+` this causes DDL lock contention — **always start with `--workers 1`**
- `/api/otx/status` takes 5-60s to respond (external HTTP call to AlienVault with no short timeout)
- Security log XPath: Windows rejects queries > ~1000 chars — `collect-events.ps1` batches Event IDs in groups of 20

### Vector
- `collect-events.ps1` runs as LocalSystem (via service) — can read Security log
- Running the script in a non-admin shell returns "Access Denied" on Security log — this is expected
- State files: `vector/data/state_Security.txt`, `state_System.txt`, `state_Application.txt` — store last processed RecordId
- If no new events match the allowlist, Vector produces 0 output and the log count stays flat — this is correct behaviour

### Frontend
- `logs/page.tsx` defaults to "All Time" on load — do NOT change back to "Last 1h" (logs stop flowing when Vector is idle)
- `src/lib/mock-data.ts` contains demo data — it is imported by the dashboard home page for chart fallback data; do not delete

---

## Critical Lessons (from fixes applied Oct 2026)

1. **XPath length limit:** Windows Security log XPath queries have a ~1000-char limit. Batch Event IDs in groups of ≤20.
2. **psycopg3 DictRow unpacking:** Tuple unpacking (`for a, b in rows`) unpacks dict **keys**, not values. Use `r["column_name"]` always.
3. **PostgreSQL DDL in exception handlers:** If `ALTER TABLE` fails inside a `try/except`, call `conn.rollback()` before any subsequent `SELECT` — otherwise the transaction stays aborted and all queries return nothing.
4. **0.0.0.0 vs 127.0.0.1:** Vector Windows Service (LocalSystem) can reach `0.0.0.0:8001` but not reliably `127.0.0.1:8001` in all contexts. Always bind to `0.0.0.0`.
5. **Histogram SQL params:** The histogram query uses separate `hist_params` — never pass the main `params` list to it when `where` clause is empty (no `%s` placeholders → psycopg3 raises parameter count error).

---

## How to Start Everything

```powershell
# 1. Start API (from D:\SOC-Dashboard\Dashboard)
python -m uvicorn api.index:app --host 0.0.0.0 --port 8001 --workers 1

# 2. Start Frontend (separate terminal)
npm run dev

# 3. Check Vector service
Get-Service VectorAgent
# If stopped:
Start-Service VectorAgent  # requires admin, OR
# start manually (no admin needed):
Start-Process "vector\bin\vector.exe" -ArgumentList "--config vector\vector-windows-agent.toml" -WorkingDirectory "D:\SOC-Dashboard\Dashboard" -WindowStyle Hidden
```

# Architecture Decisions — SOC Dashboard

## ADR-001: PostgreSQL over SQLite
**Decision:** Migrated from SQLite to PostgreSQL.  
**Reason:** SQLite's WAL file grew to 108MB; concurrent writes from Vector caused locking errors. PostgreSQL handles concurrent ingestion (Vector service + API workers) cleanly.  
**Impact:** All queries use `%s` placeholders (psycopg3 style); `DictRow` row factory replaces old `SqliteRow`.

## ADR-002: Vector exec source over windows_event_log source
**Decision:** Use Vector's `exec` source with `collect-events.ps1` instead of the native `windows_event_log` source.  
**Reason:** Vector 0.41.1 community build does not ship the `windows_event_log` source. The `exec` + PowerShell approach gives full control over event ID filtering and batching.  
**Key constraint:** Windows XPath filter for Security log has a ~1000-char limit — Event IDs must be batched in groups of ≤20.

## ADR-003: VectorAgent as Windows Service
**Decision:** Install Vector as a Windows Service (`VectorAgent`) via `New-Service` rather than running it from the dashboard UI.  
**Reason:** Survives reboots without user login. The dashboard's "Start" button spawns a duplicate Vector process (port 8686 conflict) — it was removed from the UI.  
**Note:** Service requires LocalSystem to read the Security event log.

## ADR-004: No Grafana
**Decision:** Removed Grafana immediately after initial deployment.  
**Reason:** User prefers native Next.js charts (Recharts). Grafana added complexity and an extra process with no benefit for this use case.

## ADR-005: No TimescaleDB
**Decision:** Stay with pure PostgreSQL; implement aggregations with standard `DATE_TRUNC` + materialized views.  
**Reason:** User explicitly chose PostgreSQL after TimescaleDB was suggested. TimescaleDB extension is not needed for the current data volumes (~260k rows).

## ADR-006: API bound to 0.0.0.0
**Decision:** Uvicorn binds to `0.0.0.0:8000` not `127.0.0.1:8000`.  
**Reason:** The VectorAgent Windows Service runs as LocalSystem in a different network namespace — it cannot reach `127.0.0.1` reliably. `0.0.0.0` ensures the service context can always POST to the ingest endpoint.

## ADR-007: Single uvicorn worker on startup
**Decision:** Run with `--workers 1` (not 2 or 4).  
**Reason:** Multiple workers each run `init_db()` at import time, which executes `ALTER TABLE` DDL. With an existing 260k-row `logs` table, concurrent DDL from 2+ workers causes table locks and hangs all workers on startup. Single worker avoids this; `init_db()` is idempotent so it completes in <1s.

## ADR-008: Log Explorer is self-contained page (no LogTable component)
**Decision:** `src/app/logs/page.tsx` contains all logic inline; `LogTable.tsx` was deleted.  
**Reason:** The threat hunting requirements (server-side filtering, histogram, event detail slide-over, advanced filter builder) needed a complete redesign. Keeping a shared component would have required extensive prop drilling and added no reuse value since no other page renders a full log table.

## ADR-009: Collectors directory removed
**Decision:** Deleted `collectors/` directory (`windows_collector.py`, `linux_collector.py`).  
**Reason:** Both are superseded by the Vector agent architecture. The Windows collector was replaced by `vector/collect-events.ps1` + VectorAgent service. The Linux collector is not in use (no Linux sources configured).

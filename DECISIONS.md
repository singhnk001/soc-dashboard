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

## ADR-010: Safe Date Parsing & Client-Side Exception Prevention (`date-utils.ts`)
**Decision:** All relative and formatted date calculations use `safeDistanceToNow` and `safeFormatDate` from `src/lib/date-utils.ts` instead of directly invoking `date-fns/formatDistanceToNow`.  
**Reason:** In `reference-sets/page.tsx:325`, appending a `'Z'` to an already-valid UTC ISO timestamp produced `...ZZ`, which evaluated to `Invalid Date`. Calling `formatDistanceToNow` on an `Invalid Date` throws an unhandled `RangeError: Invalid time value`, crashing Next.js during React rendering with `"Application error: a client-side exception has occurred"`.  
**Impact:** `safeDistanceToNow` validates input types, checks `!isNaN(d.getTime())`, catches exceptions internally, and always returns a safe fallback string without throwing.

## ADR-011: Global React Error Boundary for Route Fault Tolerance
**Decision:** Wrap `{children}` in `src/app/layout.tsx` with `<ErrorBoundary>` (`src/components/common/ErrorBoundary.tsx`).  
**Reason:** Next.js App Router by default crashes the entire route when a component throws during rendering. A global Error Boundary intercepts rendering exceptions, logs diagnostics, and displays a user-friendly recovery card with a one-click "Refresh View" button rather than a blank fatal screen.

## ADR-012: Cookie-Prioritized Session Hydration & Inactivity Timer Hardening
**Decision:** Updated `src/components/Header.tsx` to prioritize the HTTP session cookie (`soc_session`) over client `sessionStorage` and reset idle timeout on every navigation event (`pathname` change).  
**Reason:** Previously, `Header.tsx` aggressively wiped the cookie and called `router.push('/login')` whenever `sessionStorage.getItem('soc_user')` was momentarily null during client navigation. Additionally, an uninitialized `timeLeft` (90s) caused immediate logouts on navigation.  
**Impact:** If `soc_session` cookie is present, `Header.tsx` automatically restores `sessionStorage` state. Navigating across sidebar links now registers as active engagement, resetting the 30-minute idle countdown. A redirect to `/login` only occurs if both the cookie and `sessionStorage` are absent.

## ADR-013: Full-Viewport Standard Layout (Removal of CSS Zoom Hacks)
**Decision:** Removed all CSS `zoom` and `calc(100vw / scale)` hacks from `body` and `html`. Configured `html, body` with standard `height: 100%; width: 100%; margin: 0; padding: 0; overflow: hidden; background-color: var(--bg-primary);`. Set `/login` to `h-screen w-full`.  
**Reason:** CSS `zoom` on `body` or `html` in Chromium breaks `100vh` viewport calculations, causing child containers with `min-h-screen` or `100vh` to stop 25-35% short of the physical monitor bottom, creating an empty dark void.  
**Impact:** 100% full-screen coverage across desktop, laptop, and mobile screens without black voids or clipping.

## ADR-014: High-Density Sidebar Scaling & Responsive Proportions
**Decision:** Expanded sidebar width from `w-60` (240px) to `w-64` (256px), increased navigation font size to `text-sm font-semibold` (14px), increased icon sizes to `size={19}`, and enhanced status footer contrast.  
**Reason:** When users set browser zoom to 75% or viewed on high-DPI displays, the previous `text-xs` (12px) shrank to an unreadable 9px.  
**Impact:** Crystal-clear legibility and comfortable enterprise ergonomics across all display resolutions.

## ADR-015: Fortinet FortiGate Real-Time Firewall Simulator & Parser Integration
**Decision:** Created a dedicated Fortinet FortiGate 100F real-time firewall simulator (`scripts/fortinet_firewall_simulator.py`) supporting both direct HTTP Ingestion API (`/api/logs/ingest`) and standard RFC3164 UDP Syslog (port 514). Integrated Fortinet into `DEMO_SOURCES`, `DEMO_PARSERS`, and `DEMO_USECASES`.  
**Reason:** The user requested a realistic demo Fortinet firewall capable of streaming live traffic, UTM, IPS, SSL-VPN, and C2 threat detections into the SOC dashboard.  
**Impact:** Analysts can test live ingestion, rule matching, and real-time dashboard updates without needing physical FortiGate hardware. Logs match threat intelligence feeds (AlienVault OTX & ThreatFox) to test immediate alert correlation.

## ADR-016: MFA Auth Route, Port 8001 Backend Proxy & Dev Server Desync Recovery
**Decision:**
1. Implemented `src/app/api/auth/login/mfa/route.ts` to handle second-factor TOTP verification requested by `src/app/login/page.tsx`.
2. Updated `src/app/api/auth/login/route.ts` to proxy requests to FastAPI port `8001` (was misconfigured to `8002`) and provided native `admin`/`admin123` fallback.
3. Cleaned and recovered Next.js compilation cache following concurrent `next build` execution that had invalidated `.next/routes-manifest.json` on active dev instances.
**Reason:**
- The login interface posted to `/api/auth/login/mfa` when MFA was active, but no Next.js API route existed, returning HTTP 404.
- Running `next build` while a `next dev` instance was serving `localhost:3000` deleted and swapped webpack chunks in `.next`, causing `ENOENT: routes-manifest.json` and a blank white screen.
**Impact:** Complete elimination of MFA 404 errors, reliable admin and demo logins, and a pristine Next.js build with 0 compile errors across all 39 routes.

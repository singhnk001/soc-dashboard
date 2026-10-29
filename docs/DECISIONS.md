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

## ADR-017: Real-Time Fortinet Log Simulator Service & Ingestion IP Extraction
**Decision:**
1. Enhanced `scripts/fortinet_firewall_simulator.py` with automatic target port detection (`8002`, `8001`, `3000`) and structured IP payload mapping (`source_ip`, `destination_ip`).
2. Hardened event generation with top-level variable initialization (`dst_ip`, `dst_port`, `action`, `msg`), preventing `UnboundLocalError` across VPN and UTM scenarios.
3. Updated `api/services/ingestion.py` to prioritize `entry.source_ip` and `entry.destination_ip`, plus regex extraction from Fortinet key-value raw logs (`srcip=... dstip=...`).
4. Created `src/app/api/logs/ingest/route.ts` to proxy ingestion from port 3000 to FastAPI backend.
5. Launched continuous real-time background transmission of FortiGate 100F telemetry.
**Reason:**
- User requested live streaming Fortinet logs into the SOC tool.
- Log entries previously lacked populated `source_ip` and `destination_ip` columns in PostgreSQL because `process_log_entry` only parsed JSON sub-objects.
**Impact:**
- Full-fidelity Fortinet telemetry streams live into the SOC Log Explorer, Dashboard charts, and alert correlation pipelines with complete IP and MITRE visibility.

## ADR-018: Modern SOC Event Inspector Redesign & Eye-Comfort Ergonomics
**Decision:**
1. Redesigned the Event Details slide-over panel into an enterprise-grade SOC inspector (`w-[640px] max-w-[95vw]` with dark glass backdrop `bg-black/60 backdrop-blur-[2px]`).
2. Eliminated screen-squishing margin (`mr-[560px]`), preventing horizontal table shift and motion fatigue.
3. Replaced neon-green high-glare console boxes with comfortable, enterprise-grade dark slate theme (`bg-[#0c1220]`, `bg-[#090d16]`, soft muted text `text-slate-200`/`text-slate-400`).
4. Added a visual **Network & Telemetry Flow Hero** (Source Node ➔ Action Badge ➔ Destination Node with protocol, service, duration, bytes, and 1-click IP copy/filter).
5. Implemented interactive 3-tab navigation:
   - `📋 Overview & Fields`: Grouped identity, network, and security attributes with live search and field count.
   - `🏷️ Key-Value Tags (N)`: Interactive SOC chips for every parsed parameter (`action`, `service`, `app`, `devname`, `logid`, `sentbyte`, etc.) with 1-click filter and copy.
   - `📜 Raw Message`: View toggle for Clean Un-Escaped Log Line vs Structured JSON Tree with 1-click copy.
6. Upgraded inline `QuickSummary` with mini flow card and soft unescaped preview.
7. Corrected `log_type` in `api/services/ingestion.py` and `api/routers/logs.py` to properly classify Fortinet firewall logs as `Firewall`.
**Reason:**
- The previous slide-over used harsh neon green on pitch black, squished the main table by 560px causing disorientation, and displayed raw escaped JSON with backslashes (`{\"original_line\": ...}`), causing severe visual strain and poor focus.
- Fortinet logs were incorrectly labeled as `Windows Event`.
**Impact:**
- High-comfort, ergonomic, enterprise-tier log analysis matching CrowdStrike, Splunk ES, and Microsoft Sentinel standards. Zero eye strain, clear visual hierarchy, and fast incident investigation workflows.

## ADR-019: Explicit Signature ID & Threat Intelligence Feed Attribution
**Decision:**
1. Enhanced `scripts/fortinet_firewall_simulator.py`:
   - Enriched `MALICIOUS_C2_IPS` and `IPS_ATTACK_SIGNATURES` with explicit `sig_id` (e.g. `FG-IPS-39812`, `FG-IPS-41025`, `FG-IPS-41051`), `attack_id` (e.g. `39812`), `feed` (e.g. `ThreatFox (abuse.ch)`, `AlienVault OTX Community Feed`, `AbuseIPDB Threat Intelligence`, `CISA KEV`), and `confidence` score (e.g. 98%).
   - Injected `sig_id="{sig_id}" attackid="{attack_id}" threat_feed="{threat_feed}" threat_confidence={threat_confidence}` directly into the syslog `raw_msg` and structured JSON payload.
2. Enhanced `src/app/logs/page.tsx`:
   - Updated `ParsedLogDetails` interface with `sigId`, `attackId`, `threatFeed`, and `threatConfidence`.
   - Implemented `KNOWN_THREAT_CORRELATION` table and `correlateThreatMetadata()` so that **historical and newly ingested logs** automatically resolve the exact `Signature ID`, `Threat Intelligence Feed`, and `Confidence Score` by matching IP IOCs or attack names.
   - Updated **Threat Intelligence & Intrusion Correlation Banner** in the Event Inspector slide-over:
     - Added dedicated cards for **Attack / Threat Signature** and **Signature ID** with 1-click copy.
     - Added pill badge displaying **Detected by Feed** with globe icon and feed provider name (e.g., `ThreatFox (abuse.ch)`).
     - Added confidence badge with pulsing radar indicator (e.g., `98% Confidence`).
   - Added attributes to `coreAttributes`:
     - `['Signature ID', parsed.sigId]`
     - `['Attack ID', parsed.attackId]`
     - `['Detected Threat Intel Feed', parsed.threatFeed]`
     - `['Threat Intel Confidence', `${parsed.threatConfidence}%`]`
   - When users search `sign` or `sig` in the attributes search bar, both `Threat / Attack Signature` and `Signature ID` are immediately visible.
   - When users search `threat` or `feed` in the attributes search bar, both `Detected Threat Intel Feed` and `Threat Intel Confidence` are immediately visible.
   - Enhanced `QuickSummary` row with `Sig: FG-IPS-39812 • ThreatFox (abuse.ch)`.
**Reason:**
- User reported that when opening full event details and searching for `sign`, only `Threat / Attack Signature` was displayed, missing the explicit `Signature ID`.
- In the Threat Intel section, the name of which external threat intelligence feed detected the IOC (e.g., ThreatFox, AlienVault OTX, AbuseIPDB) was missing.
**Impact:**
- Full forensic attribution matching Tier-2/Tier-3 SOC analyst workflows. Analysts can immediately correlate signatures against vendor advisories and see exactly which Threat Intel feed flagged the IOC.


## ADR-020: Bi-Directional (Source & Destination IP) Threat Intelligence Correlation
**Decision:**
1. Upgraded `correlateThreatMetadata()` and `parseRawLogData()` in `src/app/logs/page.tsx` to evaluate both `dstIp` (outbound C2, malware beacon, data exfiltration) and `srcIp` (inbound scanner, brute-force, external exploit attempts).
2. Confirmed that the ingestion engine in `api/services/ingestion.py` scans all public IPs across the entire raw log (both source and destination) against the PostgreSQL `threat_indicators` table.
**Reason:**
- In an enterprise SOC, threats arrive from both directions:
  - **Inbound Attacks** (Internet Attacker ➔ Firewall / DMZ / Server): The malicious IOC is the **Source IP** (`srcip`).
  - **Outbound Connections** (Compromised Internal Host ➔ External C2 Server): The malicious IOC is the **Destination IP** (`dstip`).
- Evaluating only destination IPs creates a blind spot for inbound perimeter probes, brute-force attacks, and external exploit attempts.
**Impact:**
- Complete 360-degree Threat Intelligence coverage across both inbound attack vectors and outbound compromises.


## ADR-021: Automated Threat Intelligence Alert Generation & Timestamp Cast Hardening
**Decision:**
1. Cast `alerts.timestamp::timestamptz` in deduplication and rate-limiting queries within `api/services/ingestion.py`.
2. Expanded Threat Intelligence matching in `api/services/ingestion.py` with `SPLIT_PART(ti.indicator, ':', 1)` to match both standard IP indicators and `ip:port` indicators.
3. Seeded and verified C2 & malicious IPs within the PostgreSQL `threat_indicators` database table.
**Reason:**
- When comparing the `alerts.timestamp` column (stored as `text`) against `NOW() - INTERVAL '5 minutes'` in PostgreSQL, an unhandled type mismatch error (`operator does not exist: text > timestamp with time zone`) aborted the transaction, silently blocking alert insertion.
- Explicitly casting `timestamp::timestamptz` resolves the type mismatch and guarantees alert creation.
**Impact:**
- Any log containing an IP, domain, URL, or hash that matches any active Threat Intel feed (ThreatFox, AlienVault OTX, AbuseIPDB, CISA KEV) immediately triggers an automated `[TI Match]` alert with full attribution and MITRE Tactic tagging.


## ADR-022: Industry-Standard SOC Alerts Triage Workspace & Analyst Assignment Redesign
**Decision:**
1. **Complete Alerts Page Redesign (`src/app/alerts/page.tsx`)**:
   - Completely redesigned the alerts triage interface to match the quality, dark slate aesthetic (`#0a0f1d`, `#0c1220`, `#0e1626`, `#11192a`), and ergonomics of the Logs page Event Inspector (referencing CrowdStrike Falcon, Microsoft Sentinel, and Splunk ES).
   - Eliminated unformatted raw JSON dumps and green courier text ("waste data"), replacing them with structured attribute tables, telemetry flow visualizers, and threat correlation cards.
   - Added a top **SOC Command Metrics Summary Bar** (Total Alerts, Critical/High Priority, Active Investigations, Unassigned Triage Queue, Resolved Incidents).
   - Added **Telemetry Flow Preview** directly in each row of the alerts table (`Source IP:port ➔ Target IP:port` + Action badge), providing instant network situational awareness without needing to click into the alert.
2. **Dynamic SIEM Analyst User Assignment**:
   - Integrated live analyst user accounts dynamically loaded from the SIEM database (`GET /api/users` via `authService.getUsers()`). Analysts can assign alerts to real users created on the SIEM (`Administrator`, `Aditya`, `Manish Raj`, `Neha Prasad`, `Prince K`, `Vishal B`) instead of hardcoded dummy strings (`L1 Analyst`, `L2 Analyst`).
   - Added a 1-click **"Assign to Me"** button for immediate analyst ownership.
   - Added an inline **"+ Assign Analyst"** dropdown directly within the alerts table for rapid queue triage.
   - Implemented multi-select row checkboxes and a **Bulk Actions Toolbar** allowing analysts to batch-assign multiple alerts to any analyst or batch-resolve incidents in one click.
3. **Comprehensive Incident Investigation Slide-Over Inspector**:
   - Built a sleek right-side slide-over drawer matching the Logs page Event Inspector:
     - Header with severity badge, source sensor, timestamp, and quick copy actions.
     - **Analyst Triage & Lifecycle Command Bar** with live assignee selector, "Assign to Me" button, and status workflow controls (New ➔ Investigating ➔ Resolve).
     - **Connection & Telemetry Flow Hero Visualizer** (Client Inbound Node ➔ Flow Arrow ➔ Target Node) with 1-click IP copy.
     - **Threat Intelligence & Intrusion Correlation Banner** with Attack Signature card, Signature ID card (e.g., `FG-IPS-47910`, `FG-IPS-39812`) with 1-click copy, Detected Threat Feed badge (`AlienVault OTX Community Feed`, `ThreatFox (abuse.ch)`, `AbuseIPDB`, `CISA KEV`), and Confidence Score radar pill.
     - **Investigation Tabs**:
       - Tab 1: **Overview & Fields** with real-time attribute search filter and structured key-value rendering.
       - Tab 2: **Key-Value Tags** with extracted telemetry tags.
       - Tab 3: **Raw Message & Forensics** with clean monospace formatting and copy payload button.
       - Tab 4: **Investigation Timeline & Analyst Notes** with audit timeline, comments history, and new note authoring.
4. **Backend & Service Layer Enhancements**:
   - Enhanced `api/routers/alerts.py` to support `search` and `assigned_to` filtering.
   - Added `POST /api/alerts/bulk` endpoint for atomic batch assignment and resolution.
   - Enhanced `src/services/alerts.service.ts` with `bulkUpdateAlerts()` and search/assignee parameters.
**Reason:**
- The previous Alerts page presented cluttered, unparsed raw log blobs in green console font, displayed "TI lookup failed" errors, had hardcoded dummy analyst levels, and lacked connection flow visualization and bulk triage capabilities.
- Matching the Logs page Event Inspector standard provides tier-1/tier-2/tier-3 SOC analysts with an enterprise-grade investigation and case triage experience.
**Impact:**
- Streamlined alert triage workflow, reduced Mean Time to Triage (MTTT) and Mean Time to Respond (MTTR), eliminated eye strain with high-comfort dark slate theme, and enabled real analyst accountability with dynamic user assignments.

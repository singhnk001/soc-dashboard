# Memory — SOC Dashboard

Running log of system architecture, known issues, resolved bugs, and current operational state. Update this file whenever modifications are made.

---

## Current System State (Oct 2026)

| Component | Status | Notes |
|---|---|---|
| Production Vercel App | ✅ Live | `https://soc-dashboard-soc-deployment.vercel.app` |
| PostgreSQL `SOC_DB` | ✅ Running | `localhost:5432`, ~262k logs |
| FastAPI API | ✅ Running | `0.0.0.0:8002`, `--workers 1` |
| Next.js Frontend | ✅ Running (Port 3000) | Standard responsive layout, `h-screen w-full`, 40 routes compiled |
| Alerts Triage & Case Mgmt | 🌟 Modernized (ADR-022, ADR-024) | Centered modal investigation popup workstation, dynamic SIEM analyst assignment (`/api/users`), live Next.js proxy routes, telemetry flow, and incident closure |
| Event Inspector Slide-Over | 🌟 Modernized | High-comfort dark slate theme, Network Flow visualizer, 3-tab layout, zero glare |
| Threat Intel Alerts | 🚨 Automated | Real-time `[TI Match]` alerts generated on any malicious IP hit (ThreatFox, AlienVault, AbuseIPDB, CISA KEV) |
| Threat Intel & Signatures | 🛡️ Bi-Directional | Explicit `Signature ID` (`FG-IPS-39812`), `Detected Threat Intel Feed`, and `Confidence %` evaluating **BOTH Source and Destination IPs** |
| Authentication & Session Mgmt | 🔐 Hardened (ADR-023) | Cryptographic HMAC-SHA256 session tokens, server-issued `HttpOnly`/`SameSite=Lax` cookies, Edge middleware signature checks, `/api/auth/me` validation |
| Fortinet FortiGate Simulator | 🟢 Streaming | Continuous real-time background daemon (1-2 logs/sec) with enriched signature IDs and feeds |
| Log Ingestion & Extraction | ✅ Fixed | `source_ip`, `destination_ip`, and `log_type: Firewall` properly classified |
| Threat Intelligence Feeds | ✅ Active | AlienVault OTX, ThreatFox, URLhaus, CISA KEV, AbuseIPDB |
| Demo & Role Access | ✅ Active | 1-Click Demo Login (`demo`/`demo123`), Admin Login (`admin`/`admin123`) |
| Client Error Boundary | ✅ Active | `src/components/common/ErrorBoundary.tsx` wrapping main layout |

---

## Known Issues, Quirks & Workarounds

### Automated Threat Intelligence Alerts (ADR-021)
- **Automatic Alert Creation:** Whenever a firewall or endpoint log is ingested, `api/services/ingestion.py` extracts all public IPs, hashes, URLs, and domains and queries the 69,000+ indicators in `threat_indicators`.
- **Alert Creation Details:** When a match is detected:
  - Generates an alert: `[TI Match] 1 IOC matched on <Device/Host>` with `severity: critical` or `high`.
  - Attaches feed attribution: e.g., `194.26.29.112 (IPv4) — ThreatFox — Recent IOCs`.
  - Tags MITRE ATT&CK technique: `T1071` (Command and Control).
- **Rate-Limiting & Deduplication:** Throttled to 1 alert per 5 minutes per host to prevent alert flooding during high-volume attacks using `timestamp::timestamptz > NOW() - INTERVAL '5 minutes'`.

### Threat Intelligence: Bi-Directional Source & Destination Correlation (ADR-019 & ADR-020)
- **Source & Destination Coverage:** Threat Intelligence auto-detection inspects **both** `source_ip` and `destination_ip`.
  - **Inbound Attacks:** When external adversaries (e.g., scanners, brute-force sources, botnets) hit the perimeter, their IP is in `source_ip` (`srcip`). The engine queries AlienVault, ThreatFox, AbuseIPDB, and CISA KEV to identify the attacker.
  - **Outbound Connections:** When an internal compromised client initiates an outbound beacon to a C2 or malware host, the malicious IP is in `destination_ip` (`dstip`). The engine correlates the C2 server and attributes the feed.
- **Signature ID Visibility:** Displayed in both the Threat Intelligence hero card and the Attributes search table. Searching `sign` matches both `Threat / Attack Signature` and `Signature ID`.
- **Feed Attribution:** Every flagged event clearly attributes the detecting feed along with a confidence rating.

### Enterprise Alerts Triage Workspace & Analyst Case Assignment (ADR-022, ADR-024)
- **Modal Investigation Popup Workstation:** Replaced the right slide-over with a centered **Investigation Popup Window (Modal Workstation)** (`max-w-5xl max-h-[92vh]`) with backdrop blur. When an analyst clicks any alert, the workstation opens over the center of the screen with zero squishing or horizontal displacement of the underlying table.
- **Dynamic SIEM Analyst Assignment:** Replaced hardcoded dummy strings (`L1 Analyst`, `L2 Analyst`) with live user accounts fetched from `/api/users`. Analysts can assign incidents to active team members (`Administrator`, `Aditya`, `Manish Raj`, `Neha Prasad`, `Prince K`, `Vishal B`), click **"Assign to Me"** for 1-click ownership, or use the table row **"+ Assign Analyst"** dropdown for rapid queue processing.
- **Next.js API Proxy Routes:** Handlers at `/api/alerts/[alertId]` and `/api/alerts/bulk` proxy client PATCH/POST requests directly to FastAPI (`http://127.0.0.1:8002`), ensuring live database persistence for assignment and closure.
- **5 Workstation Tabs:** Features Overview & Fields (with real-time key/value search filter), Key-Value Tags, Raw Message (cleanly unescaped JSON), Investigation Timeline & Notes, and Incident Closure & Verdict (True/False Positive with close notes).
- **Stream Re-Read Fix (`api-client.ts`):** Cached raw response text before attempting JSON parsing, completely resolving `Failed to execute 'text' on 'Response': body stream already read`.

### Event Inspector & UX Ergonomics
- **No Table Squishing:** Event slide-over uses standard fixed overlay (`w-[640px] max-w-[95vw]` with `bg-black/60 backdrop-blur-[2px]`). Main table width does not contract or shift horizontally.
- **Escape Key Listener:** Pressing `Esc` immediately closes the event detail slide-over.
- **No Neon Glare:** Replaced bright green console fonts with soft slate tones (`#cbd5e1`, `#38bdf8`, `#34d399`), compliant with enterprise dark mode ergonomics.
- **Unescaped Clean Message:** Logs wrapped in JSON `{"original_line": "..."}` are automatically unwrapped to remove backslash escaping (`\"`).

### Fortinet Simulator & Ingestion
- **Simulator Port Detection:** `scripts/fortinet_firewall_simulator.py` auto-probes `http://localhost:8002`, `http://localhost:8001`, and `http://localhost:3000` to find the active ingestion endpoint.
- **Field Normalization:** `LogEntry` expects `source_ip` and `destination_ip`. The simulator emits both `source_ip`/`destination_ip` and `src_ip`/`dst_ip` for full backwards compatibility.
- **Ingestion Proxy:** `src/app/api/logs/ingest/route.ts` forwards ingest calls from Next.js (port 3000) to FastAPI (port 8002).

### Authentication & Sessions (ADR-023: Enterprise Hardened)
- **Cryptographic Tokens (`auth-token.ts`):** All session tokens are minted with Web Crypto HMAC-SHA256 containing user ID, username, role, real name, and a 30-minute expiration (`exp`).
- **Server-Issued `HttpOnly` Cookies:** Issued by `/api/auth/login` and `/api/auth/login/mfa` with `HttpOnly; SameSite=Lax; Path=/; Max-Age=1800`. Client JavaScript cannot read or alter this cookie, neutralizing XSS session theft.
- **Edge Middleware Route Protection:** `src/middleware.ts` cryptographically validates every request. Any forged (e.g. `soc_session=admin`) or expired token is rejected with HTTP 307 redirect to `/login` and deleted.
- **Server Session Validation (`/api/auth/me`):** `Header.tsx` validates the session directly against `/api/auth/me` on mount and route change. `sessionStorage` is treated purely as a transient UI cache for user profile rendering, never as an access control authority.
- **Inactivity Timeout:** Defaulted to 30 minutes (1,800s). Inactivity expiry triggers `POST /api/auth/logout`, wiping the `HttpOnly` cookie on the server and cleaning client cache.

---

## How to Run & Verify

```powershell
# 1. Start API (from D:\SOC-Dashboard\Dashboard)
python -m uvicorn api.index:app --host 0.0.0.0 --port 8002 --workers 1

# 2. Start Frontend Dev Server
npm run dev

# 3. Stream Fortinet Simulator Logs
python scripts/fortinet_firewall_simulator.py --continuous

# 4. View Alerts & Threat Intelligence
# Navigate to: http://localhost:3000/alerts -> View automatically generated [TI Match] alerts
# Navigate to: http://localhost:3000/logs -> Inspect individual events with Signature ID and Feed Attribution
```

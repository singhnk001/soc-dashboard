# Memory — SOC Dashboard

Running log of system architecture, known issues, resolved bugs, and current operational state. Update this file whenever modifications are made.

---

## Current System State (Oct 2026)

| Component | Status | Notes |
|---|---|---|
| Production Vercel App | ✅ Live | `https://soc-dashboard-soc-deployment.vercel.app` |
| PostgreSQL `SOC_DB` | ✅ Running | `localhost:5432`, ~262k logs |
| FastAPI API | ✅ Running | `0.0.0.0:8002`, `--workers 1` |
| Next.js Frontend | ✅ Running (Port 3000) | Standard responsive layout, `h-screen w-full`, 39 routes compiled |
| Authentication & MFA | ✅ Active | `/api/auth/login` (admin + demo + port 8002 proxy) & `/api/auth/login/mfa` |
| Fortinet FortiGate Simulator | 🟢 Streaming | `python scripts/fortinet_firewall_simulator.py --continuous` streaming live logs |
| Log Ingestion & Extraction | ✅ Fixed | `api/services/ingestion.py` extracts `source_ip` and `destination_ip` from Fortinet |
| Threat Intelligence Feeds | ✅ Active | AlienVault OTX, ThreatFox, URLhaus, CISA KEV, AbuseIPDB |
| Demo & Role Access | ✅ Active | 1-Click Demo Login (`demo`/`demo123`), Admin Login (`admin`/`admin123`) |
| Client Error Boundary | ✅ Active | `src/components/common/ErrorBoundary.tsx` wrapping main layout |

---

## Known Issues, Quirks & Workarounds

### Fortinet Simulator & Ingestion
- **Simulator Port Detection:** `scripts/fortinet_firewall_simulator.py` auto-probes `http://localhost:8002`, `http://localhost:8001`, and `http://localhost:3000` to find the active ingestion endpoint.
- **Field Normalization:** `LogEntry` expects `source_ip` and `destination_ip`. The simulator emits both `source_ip`/`destination_ip` and `src_ip`/`dst_ip` for full backwards compatibility.
- **Ingestion Ingestion Proxy:** `src/app/api/logs/ingest/route.ts` forwards ingest calls from Next.js (port 3000) to FastAPI (port 8002).

### Authentication & Sessions
- **MFA Route:** Handled by `src/app/api/auth/login/mfa/route.ts`. Handles both local fallback (accepts 6-digit tokens or built-in users) and forwards to backend `http://127.0.0.1:8002/api/auth/login/mfa`.
- **Admin & Demo Credentials:** `admin` (`admin123` or `admin`) and `demo` (`demo123` or `demo`) work standalone without backend database dependencies.
- **Cookie vs SessionStorage:** The primary server-side session check is the `soc_session` HTTP cookie. `Header.tsx` checks this cookie on route change. Never delete the cookie if `sessionStorage` is merely unhydrated; always restore `sessionStorage` from the cookie.
- **Inactivity Timeout:** Defaulted to 30 minutes (1,800s). Reset on every `pathname` change and user activity. Minimum clamp is 10 minutes.

### Rendering & Dev Server Cache
- **Concurrent `next build` vs `next dev`:** Running `next build` while `next dev` is running overwrites `.next/routes-manifest.json` and causes `ENOENT` / blank white screens in the browser. Always stop running dev servers before running a build, or wipe `.next` and restart `npm run dev`.
- **Never call raw `formatDistanceToNow` on arbitrary dates:** An `Invalid Date` object causes `date-fns` to throw a fatal `RangeError: Invalid time value`. Always use `safeDistanceToNow` from `src/lib/date-utils.ts`.
- **Avoid CSS `zoom` on `body` or `html`:** Setting `zoom: 0.75` in Chromium breaks `100vh` and causes bottom 25-35% black voids on containers using `min-h-screen` (like `/login`). Use native CSS responsive padding, flexbox, and standard viewport metrics instead.

---

## How to Run & Verify

```powershell
# 1. Start API (from D:\SOC-Dashboard\Dashboard)
python -m uvicorn api.index:app --host 0.0.0.0 --port 8002 --workers 1

# 2. Start Frontend Dev Server
npm run dev

# 3. Stream Fortinet Simulator Logs
python scripts/fortinet_firewall_simulator.py --continuous

# 4. View Fortinet Logs in Real-Time
# Navigate to: http://localhost:3000/logs -> Filter Source: "Fortinet-FortiGate"
```

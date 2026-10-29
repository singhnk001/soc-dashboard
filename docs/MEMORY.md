# Memory — SOC Dashboard

Running log of system architecture, known issues, resolved bugs, and current operational state. Update this file whenever modifications are made.

---

## Current System State (Oct 2026)

| Component | Status | Notes |
|---|---|---|
| Production Vercel App | ✅ Live | `https://soc-dashboard-soc-deployment.vercel.app` |
| PostgreSQL `SOC_DB` | ✅ Running | `localhost:5432`, ~262k logs |
| FastAPI API | ✅ Running | `0.0.0.0:8001`, `--workers 1` |
| Next.js Frontend | ✅ Ready (Clean Build) | Standard responsive layout, `h-screen w-full`, 39 routes compiled |
| Authentication & MFA | ✅ Fixed | `/api/auth/login` (admin + demo + port 8001 proxy) & `/api/auth/login/mfa` |
| VectorAgent (Windows Service) | ✅ Configured | Service context LocalSystem, batches Event IDs ≤20 |
| Threat Intelligence Feeds | ✅ Active | AlienVault OTX, ThreatFox, URLhaus, CISA KEV, AbuseIPDB |
| Fortinet FortiGate Simulator | ✅ Ready | `python scripts/fortinet_firewall_simulator.py --continuous` |
| Demo & Role Access | ✅ Active | 1-Click Demo Login (`demo`/`demo123`), Admin Login (`admin`/`admin123`) |
| Client Error Boundary | ✅ Active | `src/components/common/ErrorBoundary.tsx` wrapping main layout |

---

## Known Issues, Quirks & Workarounds

### Authentication & Sessions
- **MFA Route:** Handled by `src/app/api/auth/login/mfa/route.ts`. Handles both local fallback (accepts 6-digit tokens or built-in users) and forwards to backend `http://127.0.0.1:8001/api/auth/login/mfa`.
- **Admin & Demo Credentials:** `admin` (`admin123` or `admin`) and `demo` (`demo123` or `demo`) work standalone without backend database dependencies.
- **Cookie vs SessionStorage:** The primary server-side session check is the `soc_session` HTTP cookie. `Header.tsx` checks this cookie on route change. Never delete the cookie if `sessionStorage` is merely unhydrated; always restore `sessionStorage` from the cookie.
- **Inactivity Timeout:** Defaulted to 30 minutes (1,800s). Reset on every `pathname` change and user activity. Minimum clamp is 10 minutes.

### Rendering & Dev Server Cache
- **Concurrent `next build` vs `next dev`:** Running `next build` while `next dev` is running overwrites `.next/routes-manifest.json` and causes `ENOENT` / blank white screens in the browser. Always stop running dev servers before running a build, or wipe `.next` and restart `npm run dev`.
- **Never call raw `formatDistanceToNow` on arbitrary dates:** An `Invalid Date` object causes `date-fns` to throw a fatal `RangeError: Invalid time value`. Always use `safeDistanceToNow` from `src/lib/date-utils.ts`.
- **Avoid CSS `zoom` on `body` or `html`:** Setting `zoom: 0.75` in Chromium breaks `100vh` and causes bottom 25-35% black voids on containers using `min-h-screen` (like `/login`). Use native CSS responsive padding, flexbox, and standard viewport metrics instead.

### Backend & Database
- `init_db()` runs at module import time. Always run uvicorn with `--workers 1` to prevent DDL lock contention on the 260k-row `logs` table.
- `/api/otx/status` performs external calls to AlienVault; fallback and abort signals are required to prevent UI blocking.
- Security log XPath: Windows rejects queries > ~1000 chars. `collect-events.ps1` batches Event IDs in groups of ≤20.

---

## Critical Lessons Learned (Oct 2026)

1. **Next.js Dev Server Manifest Desynchronization:** If `next build` is run in parallel with `next dev`, the dev server in memory loses track of compilation manifests (`routes-manifest.json`), returning 500 errors and blank HTML to the browser. Terminate stale Node processes and clean `.next/` before starting `next dev`.
2. **Date Validation in Render Trees:** In `reference-sets/page.tsx:325`, appending `'Z'` to an already-valid ISO string produced `"2026-10-29T21:02:37.000ZZ"`. `new Date("...ZZ")` returns `Invalid Date`. When passed to `formatDistanceToNow`, it crashed the entire page with `"Application error: a client-side exception has occurred"`. Always sanitize and validate via `safeDistanceToNow`.
3. **Session Preservation Across Route Transitions:** When using client-side navigation (`Link`), components can re-render before `sessionStorage` is read. If an auth guard checks `!sessionStorage.getItem()` and immediately clears cookies, it creates an infinite logout loop. Always check the cookie before evicting a session.
4. **PowerShell Text Encoding:** When modifying code files using PowerShell scripts, Windows PowerShell 5.1 defaults to ANSI or UTF-16 LE if `-Encoding utf8` is omitted, causing Webpack/Turbopack compilation errors (`stream did not contain valid UTF-8`). Always use UTF-8 or Node.js scripts for file transformations.

---

## How to Run & Verify

```powershell
# 1. Start API (from D:\SOC-Dashboard\Dashboard)
python -m uvicorn api.index:app --host 0.0.0.0 --port 8001 --workers 1

# 2. Start Frontend Dev Server
npm run dev

# 3. Production Build Verification
npm run build

# 4. Check Vector Service
Get-Service VectorAgent
```

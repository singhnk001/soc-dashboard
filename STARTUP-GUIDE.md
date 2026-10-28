# SOC Dashboard — Startup Guide

## Quick Start (Recommended)

Double-click **`START-SOC-DASHBOARD.bat`** in the project root.

> If Windows SmartScreen prompts, click **More info → Run anyway**.  
> The script opens one coloured terminal per service and prints the URLs when ready.

---

## What Gets Started

| # | Service | Port | Terminal Colour |
|---|---------|------|-----------------|
| 1 | PostgreSQL (auto-detected) | 5432 | — (background) |
| 2 | FastAPI Core API | 8001 | Cyan |
| 3 | Next.js Frontend | 3000 | Yellow |
| 4 | VectorAgent (log collector) | 8686 | Blue |

Once all windows are open, open your browser at:

```
http://localhost:3000
```

---

## Manual Start (one terminal per service)

If the `.bat` file doesn't work, start each service in its own PowerShell/CMD window.

### PostgreSQL
PostgreSQL starts automatically with Windows. To check:
```powershell
netstat -ano | findstr :5432
```
If it's not running, open **Services** (`services.msc`) and start `postgresql-x64-16`.

---

### Core API (FastAPI)
```powershell
cd "D:\SOC-Dashboard\Dashboard"
python -m uvicorn api.index:app --host 0.0.0.0 --port 8001 --workers 1
```
Verify it's up:
```powershell
Invoke-RestMethod http://localhost:8001/api/system/health
```
Expected response: `{ "status": "ok", "database": "postgresql" }`

> **Why `--workers 1`?** Multiple workers race on the `init_db()` startup DDL and can deadlock on low-RAM machines. Use `--workers 2` only when you have >2 GB free RAM.

---

### Next.js Frontend
Open a **second** terminal:
```powershell
cd "D:\SOC-Dashboard\Dashboard"
npm run dev
```
Wait for:
```
▲ Next.js 15.x
- Local: http://localhost:3000
✓ Ready
```

---

### VectorAgent (Log Collector)

**Option A — Windows Service** *(requires admin PowerShell)*
```powershell
Start-Service VectorAgent
Get-Service VectorAgent
```

**Option B — Direct process** *(no admin needed, terminal stays open)*
```powershell
cd "D:\SOC-Dashboard\Dashboard"
& "C:\Program Files\Vector\bin\vector.exe" --config vector\vector-windows-agent.toml
```

Verify Vector is running:
```powershell
Invoke-RestMethod http://127.0.0.1:8686/health
```

---

## Checking Everything Is Working

Run all health checks in one shot:
```powershell
# API health
Invoke-RestMethod http://localhost:8001/api/system/health

# Log count
Invoke-RestMethod http://localhost:8001/api/logs | Select-Object -ExpandProperty total

# Vector health
Invoke-RestMethod http://127.0.0.1:8686/health
```

---

## Stopping All Services

Close the three terminal windows (API, Frontend, Vector), or run:
```powershell
# Kill API and Frontend
Stop-Process -Name python -Force -ErrorAction SilentlyContinue
Stop-Process -Name node   -Force -ErrorAction SilentlyContinue

# Stop Vector (if running as a process, not service)
Stop-Process -Name vector -Force -ErrorAction SilentlyContinue

# Stop Vector Windows Service (admin)
Stop-Service VectorAgent -ErrorAction SilentlyContinue
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Address already in use` on port 8001 | Run `netstat -ano \| findstr :8001` → `taskkill /PID <pid> /F` |
| `Address already in use` on port 3000 | Same as above with `:3000` |
| API starts but returns 500 on all routes | PostgreSQL is not running — check `services.msc` |
| Logs not arriving in Dashboard | Check Vector is running: `Invoke-RestMethod http://127.0.0.1:8686/health` |
| `ENOENT pages/_document.js` on Next.js | `next.config.ts` has `output: 'standalone'` — remove it for dev |
| Security events not appearing | VectorAgent needs to run as a Windows Service (LocalSystem) to read the Security event log |
| API workers hang on startup | Always use `--workers 1`; multiple workers deadlock on `init_db()` |

---

## Service Dependencies

```
Browser
  └── Next.js :3000
        └── FastAPI :8001
              └── PostgreSQL :5432

Windows Event Log
  └── VectorAgent (collect-events.ps1)
        └── FastAPI :8001  ← posts NDJSON to /api/ingest
              └── PostgreSQL :5432
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/SOC_DB
OTX_API_KEY=<your AlienVault OTX key>
ABUSEIPDB_API_KEY=<your AbuseIPDB key>
```

> Never commit `.env.local` — it is in `.gitignore`.

# Rollback Plan & Recovery Guide (docs/rollback.md)

This document provides exact step-by-step instructions to roll back changes made to the SOC Dashboard codebase.

---

## 1. Quick Git Rollback Checkpoints

### Current Checkpoint (Post Event Inspector & UX Ergonomics Redesign)
- **Commit:** Latest on `main`
- **Features:** Redesigned Event Inspector slide-over (network flow visualizer, 3-tab layout, eye-comfort slate theme, no table squish), inline QuickSummary upgrade, `log_type: Firewall` normalization, auto-detecting Fortinet simulator (`scripts/fortinet_firewall_simulator.py`), `source_ip`/`destination_ip` extraction in `api/services/ingestion.py`, Next.js ingestion proxy (`/api/logs/ingest`), `/api/auth/login/mfa` route, FastAPI port 8002 proxying, safe date parsing (`date-utils.ts`), and global `ErrorBoundary`.

### Previous Checkpoints:
- **`1840e76`:** Simulator scope fix and default variable initialization.
- **`4d875d7`:** Live simulator ingestion, IP extraction, and docs.
- **`a9371dc`:** MFA route, admin fallback, dev server cache cleanup.
- **`e10ad61`:** Updated docs and Fortinet initial integration.
- **`05b95a9`:** Fortinet FortiGate simulator and documentation.
- **`71e3b28`:** Session preservation on navigation, date exception fix, ErrorBoundary.
- **Remote:** `https://github.com/singhnk001/soc-dashboard.git`
- **Branch:** `main`

---

## 2. Rollback Procedures

### Procedure A: Full Git Rollback to Previous Stable Commit
To revert the entire codebase back to a specific checkpoint:
```powershell
$env:PATH = "C:\Users\niles\AppData\Local\Microsoft\WinGet\Packages\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd;" + $env:PATH
git reset --hard <checkpoint-hash>
git push origin main --force
```

### Procedure B: Reverting Event Inspector UI Only
To restore the previous `logs/page.tsx`:
```powershell
git checkout 1840e76 -- src/app/logs/page.tsx
npm.cmd run build
```

### Procedure C: Stopping the Fortinet Simulator
To stop the background Fortinet simulator at any time:
```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*fortinet_firewall_simulator*" } | Stop-Process -Force
```

---

## 3. Post-Rollback Verification & Deployment

Whenever a rollback is executed:
1. Verify the production build compiles with 0 errors:
   ```powershell
   npm.cmd run build
   ```
2. Commit and push the rollback to GitHub:
   ```powershell
   git push origin main
   ```
3. Vercel automatically detects the push and deploys the rolled-back state.

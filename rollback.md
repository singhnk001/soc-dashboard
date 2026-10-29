# Rollback Plan & Recovery Guide (docs/rollback.md)

This document provides exact step-by-step instructions to roll back changes made to the SOC Dashboard codebase.

---

## 1. Quick Git Rollback Checkpoints

### Current Checkpoint (Post Fortinet Simulator & Ingestion Enhancements)
- **Commit:** Latest on `main`
- **Features:** Auto-detecting Fortinet simulator (`scripts/fortinet_firewall_simulator.py`), `source_ip`/`destination_ip` extraction in `api/services/ingestion.py`, Next.js ingestion proxy (`/api/logs/ingest`), `/api/auth/login/mfa` route, FastAPI port 8002 proxying, safe date parsing (`date-utils.ts`), and global `ErrorBoundary`.

### Previous Checkpoints:
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

### Procedure B: Stopping the Fortinet Simulator
To stop the background Fortinet simulator at any time:
```powershell
Get-Process python | Where-Object { $_.CommandLine -like "*fortinet_firewall_simulator*" } | Stop-Process -Force
```

### Procedure C: Reverting Specific Features Without Full Rollback

#### 1. Revert Ingestion Extraction:
```powershell
git checkout a9371dc -- api/services/ingestion.py
```

#### 2. Revert Next.js Ingest Proxy:
```powershell
Remove-Item -Path "src\app\api\logs\ingest" -Recurse -Force
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

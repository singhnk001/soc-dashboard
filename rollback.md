# Rollback Plan & Recovery Guide (docs/rollback.md)

This document provides exact step-by-step instructions to roll back changes made to the SOC Dashboard codebase.

---

## 1. Quick Git Rollback Checkpoints

### Current Checkpoint (ADR-022: Industry-Standard SOC Alerts Triage Workspace & Analyst Assignment Redesign)
- **Commit:** Latest on `main`
- **Features:** 
  - Complete redesign of `src/app/alerts/page.tsx` with high-visibility dark slate theme (`#0a0f1d`, `#0c1220`, `#0e1626`).
  - Dynamic SIEM analyst user assignment dropdown fetching real users from `/api/users`.
  - 1-Click "Assign to Me" button and table row "+ Assign Analyst" fast triage selector.
  - Telemetry flow preview in table rows (`Source IP:port ➔ Target IP:port` + Action badge).
  - Bulk actions toolbar for batch assignment and multi-incident resolution.
  - Incident investigation slide-over inspector with connection flow, threat correlation (Signature ID, Attack Name, Feed attribution, Confidence score), and 4 tabs (Overview & Fields with search, Tags, Raw Log, Timeline & Notes).
  - Backend API enhancements in `api/routers/alerts.py` (`search`, `assigned_to`, and `POST /api/alerts/bulk`).

### Previous Checkpoints:
- **`1596762`:** Automated Threat Intelligence Alert Generation & Timestamp Cast Hardening (ADR-021).
- **`21cc580`:** Bi-directional (Source & Destination IP) TI correlation (ADR-020).
- **`84775ac`:** Explicit Signature ID & Detected Threat Intel Feed Attribution (ADR-019).
- **`72b9a1e`:** Event Inspector UX & Ergonomics redesign (dark slate theme, connection flow hero, 3 tabs).
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

### Procedure B: Reverting Ingestion Service Only
To restore the previous `api/services/ingestion.py`:
```powershell
git checkout 21cc580 -- api/services/ingestion.py
```

### Procedure C: Stopping or Restarting the Fortinet Simulator
To stop the background Fortinet simulator at any time:
```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*fortinet_firewall_simulator*" } | Stop-Process -Force
```
To restart the simulator:
```powershell
python scripts/fortinet_firewall_simulator.py --continuous --rate 1.0
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

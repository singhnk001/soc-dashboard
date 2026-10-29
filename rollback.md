# Rollback Plan & Recovery Guide (docs/rollback.md)

This document provides exact step-by-step instructions to roll back changes made to the SOC Dashboard codebase.

---

## 1. Quick Git Rollback Checkpoints

### Current Checkpoint (ADR-021: Automated Threat Intelligence Alert Generation & Timestamp Cast Hardening)
- **Commit:** Latest on `main`
- **Features:** 
  - Automated `[TI Match]` alert creation whenever an ingested log matches any indicator in the 69,000+ `threat_indicators` table (ThreatFox, AlienVault OTX, AbuseIPDB, CISA KEV).
  - Explicit `alerts.timestamp::timestamptz` type casting preventing PostgreSQL transaction aborts.
  - Substring matching for `ip:port` indicators via `SPLIT_PART(ti.indicator, ':', 1)`.
  - Bi-directional Threat Intelligence correlation across both Source IP and Destination IP.
  - Explicit `Signature ID` and `Detected Threat Intel Feed` attribution.

### Previous Checkpoints:
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

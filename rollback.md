# Rollback Plan & Recovery Guide (docs/rollback.md)

This document provides exact step-by-step instructions to roll back changes made to the SOC Dashboard codebase.

---

## 1. Quick Git Rollback Checkpoints

### Current Checkpoint (ADR-020: Bi-Directional Source & Destination TI Correlation)
- **Commit:** Latest on `main`
- **Features:** 
  - Bi-directional Threat Intelligence correlation across **both Source IP and Destination IP** in `src/app/logs/page.tsx` and `api/services/ingestion.py`.
  - Added explicit `Signature ID` (`FG-IPS-39812`, `FG-IPS-41025`, `FG-IPS-41051`) and `Detected Threat Intel Feed` (`ThreatFox (abuse.ch)`, `AlienVault OTX Community Feed`, `AbuseIPDB Threat Intelligence`, `CISA KEV`) to the Threat Intelligence & Intrusion Correlation banner.
  - Added `Signature ID` and `Detected Threat Intel Feed` to attributes list and live search in `src/app/logs/page.tsx` (searching `sign` displays both signature name and signature ID).
  - Enriched `scripts/fortinet_firewall_simulator.py` with `sig_id`, `attack_id`, `threat_feed`, and `threat_confidence` in syslog strings and JSON payloads.

### Previous Checkpoints:
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

### Procedure B: Reverting Specific Files
To restore the previous `logs/page.tsx`:
```powershell
git checkout 84775ac -- src/app/logs/page.tsx
npm.cmd run build
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

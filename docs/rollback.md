# Rollback Plan & Recovery Guide (docs/rollback.md)

This document provides exact step-by-step instructions to roll back changes made to the SOC Dashboard codebase.

---

## 1. Quick Git Rollback Checkpoints

### Current Checkpoint (Post MFA & Port 8001 Fix)
- **Commit:** Latest on `main`
- **Features:** Fixed `/api/auth/login/mfa` 404, fixed API port proxy to 8001, added admin credential fallback, dev server cache cleanup, Fortinet firewall simulator, date parsing crash prevention (`date-utils.ts`), and global `ErrorBoundary`.

### Previous Checkpoints:
- **`e10ad61`:** Updated docs and Fortinet integration.
- **`05b95a9`:** Fortinet FortiGate simulator and documentation.
- **`71e3b28`:** Session preservation on navigation, date exception fix, ErrorBoundary.
- **`11fbe1e`:** Sidebar text/icon enlargement.
- **`272ad8d`:** Alert rate sparkline fix, initial viewport normalization.
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

### Procedure B: Reverting Specific Features Without Full Rollback

#### 1. Revert MFA & Auth API Changes:
To restore previous `login/route.ts` and remove `login/mfa`:
```powershell
Remove-Item -Path "src\app\api\auth\login\mfa" -Recurse -Force
git checkout 71e3b28 -- src/app/api/auth/login/route.ts
```

#### 2. Revert Safe Date Utility (`date-utils.ts`):
To restore a specific page to prior date handling:
```powershell
git checkout 11fbe1e -- src/app/reference-sets/page.tsx
```

#### 3. Revert Header Auth & Timeout Logic:
To restore previous `Header.tsx`:
```powershell
git checkout 11fbe1e -- src/components/Header.tsx
```

#### 4. Revert Global Error Boundary:
Remove `<ErrorBoundary>` tags from `src/app/layout.tsx` and delete the component:
```powershell
Remove-Item -Path "src\components\common\ErrorBoundary.tsx" -Force
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

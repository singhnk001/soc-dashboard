# Rollback Plan & Recovery Guide (rollback.md)

This document provides exact step-by-step instructions to roll back changes made to the SOC Dashboard codebase.

---

## 1. Quick Git Rollback Checkpoints

### Current Fix Checkpoint (Commit to be created)
- **Description:** Fixes client-side exceptions (`RangeError` in date formatting), fixes automatic logout bug on sidebar navigation, eliminates login screen void, introduces `ErrorBoundary`, and removes broken CSS zoom.

### Previous Stable Checkpoint:
- **Commit:** `11fbe1e` (or prior commit `272ad8d`)
- **Remote:** `https://github.com/singhnk001/soc-dashboard.git`
- **Branch:** `main`

---

## 2. Rollback Procedures

### Procedure A: Full Git Rollback to Previous Commit
To revert the entire codebase back to the state before this fix, execute:
```powershell
$env:PATH = "C:\Users\niles\AppData\Local\Microsoft\WinGet\Packages\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd;" + $env:PATH
git reset --hard 11fbe1e
git push origin main --force
```

### Procedure B: Revert Single Specific Feature

#### 1. Revert Safe Date Utility (`date-utils.ts`):
If you need to restore `date-fns` direct usage in a specific file:
```powershell
git checkout HEAD~1 -- src/app/reference-sets/page.tsx
```

#### 2. Revert Header Auth & Timeout Logic:
If you need to restore previous `Header.tsx`:
```powershell
git checkout 11fbe1e -- src/components/Header.tsx
```

#### 3. Revert Error Boundary:
Remove `<ErrorBoundary>` tags from `src/app/layout.tsx` and delete `src/components/common/ErrorBoundary.tsx`:
```powershell
Remove-Item -Path "src\components\common\ErrorBoundary.tsx" -Force
```

---

## 3. Deployment Verification After Rollback
After performing any rollback:
1. Verify build compiles cleanly:
   ```powershell
   npm.cmd run build
   ```
2. Push to GitHub:
   ```powershell
   git push origin main
   ```
3. Vercel will automatically build and deploy the reverted commit to production.

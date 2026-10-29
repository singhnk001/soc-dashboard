# Rollback Plan & Recovery Guide (docs/rollback.md)

This document provides exact step-by-step instructions to roll back changes made to the SOC Dashboard codebase.

---

## 1. Quick Git Rollback Checkpoints

### Current Fix Checkpoint (Commit `71e3b28`)
- **Description:** Fixed automatic logout on navigation, eliminated client-side exceptions (`RangeError` in date-fns), fixed login screen bottom void, introduced `ErrorBoundary`, and centralized safe date utilities.

### Previous Checkpoints:
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

#### 1. Revert Safe Date Utility (`date-utils.ts`):
To restore a specific page to prior date handling:
```powershell
git checkout 11fbe1e -- src/app/reference-sets/page.tsx
```

#### 2. Revert Header Auth & Timeout Logic:
To restore previous `Header.tsx`:
```powershell
git checkout 11fbe1e -- src/components/Header.tsx
```

#### 3. Revert Global Error Boundary:
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

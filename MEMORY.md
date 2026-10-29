# Project Memory & Tracking (MEMORY.md)

## Current Workspace
- **Directory:** `d:\SOC-Dashboard\Dashboard`
- **Branch:** `main`
- **Active Deployment:** `https://soc-dashboard-soc-deployment.vercel.app` (and Git deployment preview URLs)

---

## Chronological Request & Issue History

### Request: Patch Node.js Vulnerability
- **Action:** Upgraded Node.js dependencies and confirmed clean audit.

### Request: Project Architecture & Folder Cleanup
- **Action:** Separated business logic into `/services`, modularized common components (`/components/common`), standardized error handling, and configured demo mocks for isolated review.

### Request: Demo Login & Threat Intel / Sources / Parsers Demo Data
- **Action:** Added 1-click Demo Login button (`demo` / `demo123` read-only role). Added comprehensive demo data for Threat Intel feeds, AlienVault OTX, and Reference Sets.

### Request: UI Scaling, Aspect Ratio & Sidebar Readability
- **Action:** Enlarged sidebar typography (`text-sm font-semibold`, `w-64`) and icons (`size={19}`) so navigation items are crisp and legible.

### Request: Fix Automatic Logout, Client-Side Exception Crashes, and Login Screen Layout (Current)
- **Problem 1 (Crash):** `RangeError: Invalid time value` occurred on `/reference-sets` due to malformed date string appending (`.replace(' ', 'T') + 'Z'`).
  - **Resolution:** Replaced raw `formatDistanceToNow` calls with `safeDistanceToNow` in `src/lib/date-utils.ts`. Added global `ErrorBoundary.tsx`.
- **Problem 2 (Logout on Navigation):** Clicking any sidebar link triggered a false logout because `Header.tsx` aggressively wiped the session cookie when `sessionStorage` was not immediately read, and the idle timer defaulted to 90 seconds.
  - **Resolution:** Updated `Header.tsx` to trust the `soc_session` cookie and rehydrate `sessionStorage` automatically. Defaulted idle timeout safely to 1,800 seconds (30 mins) with auto-reset on navigation.
- **Problem 3 (Login Screen Cutoff):** CSS `zoom` and `calc(100vh / scale)` on `body` broke `100vh` in Chromium, leaving a bottom void.
  - **Resolution:** Removed `zoom` from `body` and restored standard `h-screen w-full` full-viewport coverage across `/login` and main layout.

---

## Key Files Reference
- `DECISIONS.md`: In-depth rationale for architectural and technical choices.
- `rollback.md`: Reversion plans and checkpoints.
- `src/lib/date-utils.ts`: Robust date formatting (`safeDistanceToNow`).
- `src/components/common/ErrorBoundary.tsx`: React error boundary.
- `src/components/Header.tsx`: Session verification and idle timeout manager.
- `src/components/Sidebar.tsx`: High-contrast, scalable navigation.

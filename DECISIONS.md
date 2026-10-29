# Architectural Decisions & Bug Fixes Log (DECISIONS.md)

This document records architectural decisions, root cause analyses, and code changes made to the SOC Dashboard application.

---

## Decision 1: Safe Date Formatting & Eradication of Client-Side Exceptions
- **Problem:** When navigating to pages like `/reference-sets`, Next.js crashed with a fatal client error:  
  `"Application error: a client-side exception has occurred while loading ... (see the browser console for more information)"`.
- **Root Cause:** In `src/app/reference-sets/page.tsx:325`, `formatDistanceToNow(new Date(item.added_at.replace(' ', 'T') + 'Z'))` attempted to append a `'Z'` to an already UTC ISO string (e.g. `"2026-10-29T21:02:37.000ZZ"`), producing an `Invalid Date`. Calling `formatDistanceToNow` on an `Invalid Date` threw an unhandled `RangeError: Invalid time value`, which crashed React during rendering. Similar risky date calls existed across `alerts`, `threat-intel`, `troubleshooting`, `sources`, and `AlertCard`.
- **Decision:**
  1. Created [`src/lib/date-utils.ts`](file:///d:/SOC-Dashboard/Dashboard/src/lib/date-utils.ts) with `safeDistanceToNow(val, fallback)`. This wrapper validates input types, checks `!isNaN(d.getTime())`, uses try/catch, and always returns a safe human-readable string without ever throwing.
  2. Replaced raw `formatDistanceToNow` calls across all routes with `safeDistanceToNow`.
  3. Created a global [`ErrorBoundary.tsx`](file:///d:/SOC-Dashboard/Dashboard/src/components/common/ErrorBoundary.tsx) wrapping `{children}` inside [`src/app/layout.tsx`](file:///d:/SOC-Dashboard/Dashboard/src/app/layout.tsx) to catch any potential runtime rendering errors gracefully with a user-facing retry button.

---

## Decision 2: Elimination of Automatic Logout on Navigation
- **Problem:** After logging in, clicking any navigation link in the sidebar immediately logged the user out and redirected back to `/login`.
- **Root Cause:**
  1. In `src/components/Header.tsx`, a `useEffect` watched `[pathname, router]` and checked `!sessionStorage.getItem('soc_user')`. If `sessionStorage` was not immediately available upon client route transition, it explicitly erased the `soc_session` cookie (`document.cookie = 'soc_session=; ...'`) and pushed to `/login`.
  2. In `Header.tsx`, the idle timer was initialized with `useState(90)`. If `localStorage` had an invalid timeout, the timer tick fired within seconds and called `handleLogout()`.
- **Decision:**
  1. Updated `Header.tsx` to prioritize the HTTP session cookie (`soc_session`). If the cookie exists, the user is authenticated. If `sessionStorage` lacks `soc_user`, it dynamically re-populates the user state from the cookie rather than destroying authentication.
  2. Only redirect to `/login` if BOTH the cookie and `sessionStorage` are absent.
  3. Default idle timeout safely to 1,800 seconds (30 minutes), and reset the timer on every route change (`pathname`), acknowledging user navigation as active engagement.

---

## Decision 3: Removal of Broken CSS Zoom Hacks & Layout Normalization
- **Problem:** The login screen displayed a large dark void covering the bottom 35% of the viewport (`media_1793301929157_6ef886f4.png`).
- **Root Cause:** Setting CSS `zoom` and `width/height: calc(100vw / 0.75)` on `body` broke standard `100vh` viewport calculations in Chromium, causing `<div className="min-h-screen">` on `/login` to render only to 100vh of the unzoomed space, leaving the remainder of the body blank.
- **Decision:**
  1. Cleaned up `globals.css` and `layout.tsx`. Restored `html, body` to standard `height: 100%; width: 100%; margin: 0; padding: 0; overflow: hidden; background-color: var(--bg-primary);`.
  2. Set `/login` to `<div className="h-screen w-full bg-[var(--bg-primary)] flex items-center justify-center p-4 overflow-y-auto">`, ensuring it covers 100% of the screen seamlessly with zero black bars or voids.
  3. Retained large, bold sidebar typography (`text-sm font-semibold`, `w-64`) so the interface remains readable across all browser zoom levels.

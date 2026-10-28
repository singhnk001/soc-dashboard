# Cursor Rules — SOC Dashboard

## Stack Context
- **Frontend:** Next.js 15 App Router, TypeScript strict, Tailwind CSS, Recharts, lucide-react, date-fns, SWR
- **Backend:** FastAPI, Python 3.14, psycopg3 (NOT psycopg2), PostgreSQL
- **No:** SQLite, Grafana, TimescaleDB, Docker (not used in this project)

## Python / FastAPI

- Always use `%s` placeholders for PostgreSQL queries (psycopg3 style). Never use `?`.
- Use `with get_db() as conn:` for all DB access. Never `conn = get_db()` without context manager.
- Row access: always use `r["column_name"]`, never tuple unpacking (`a, b = row` iterates dict keys).
- After any caught DDL exception, call `conn.rollback()` before further queries.
- The histogram query uses its own `hist_params` list — never pass the outer `params` list to it when `where` is empty.
- Keep `--workers 1` for uvicorn until `init_db()` is moved out of module scope.
- API must bind to `0.0.0.0` (not `127.0.0.1`) so the VectorAgent Windows Service can reach it.

## TypeScript / React

- All dashboard pages are `'use client'`. No SSR.
- Use `var(--bg-card)`, `var(--text-primary)` etc. for all surface colours. Never hardcode hex or use `bg-white`.
- Severity colour map: critical=red-400, high=orange-400, medium=yellow-400, low=blue-400, info=gray-400.
- Log tables must use `table-fixed` with `<colgroup>` explicit widths. Auto-sizing columns cause value wrapping.
- Long values (>60 chars) in attribute panels: truncate by default, click-to-expand.
- Use `lucide-react` for all icons.
- Never use `dangerouslySetInnerHTML` for log content.
- `formatDistanceToNow` must not be used for "First Seen" fields — use `format(date, 'MMM dd yyyy HH:mm:ss')`.

## File Organisation

- API routes belong in `api/index.py` unless split into a named router module.
- Shared React components go in `src/components/`. Page-specific logic stays inline in the page file.
- `src/lib/mock-data.ts` — used by the dashboard home for chart fallback only. Do not add new mock data here.
- `vector/collect-events.ps1` — the active collector script. The `vector/vector-syslog-collector.toml` is inactive.

## What NOT to Do

- Do not add Grafana or iframe-based visualisation tools without explicit user confirmation.
- Do not implement TimescaleDB features — stay with pure PostgreSQL.
- Do not run `init_db()` with multiple uvicorn workers until the function is moved to startup event.
- Do not change the default `timePreset` in `logs/page.tsx` to anything other than `0` (All Time).
- Do not start the "Vector Log Agent" from the Troubleshooting GUI — the Windows Service handles this.
- Do not echo or store API keys that appear in chat messages.

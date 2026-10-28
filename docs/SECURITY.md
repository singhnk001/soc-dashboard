# Security — SOC Dashboard

## Authentication
- JWT-based session stored in an `HttpOnly` cookie
- Login: `POST /api/auth/login` with username + password (bcrypt hashed in `users` table)
- Protected routes enforced by `src/middleware.ts` — unauthenticated requests redirect to `/login`
- Token expiry: 24 hours

## API Security
- All mutating endpoints require a valid session token
- CORS restricted to `localhost` origins only (not configured for public exposure)
- API bound to `0.0.0.0:8000` so the Vector Windows Service (LocalSystem) can reach it
- Parameterised SQL queries throughout (`%s` placeholders via psycopg3) — no string interpolation in queries

## Secrets Management
- `.env` file at project root — **never committed to git** (listed in `.gitignore`)
- Required env vars: `DATABASE_URL`, `SECRET_KEY`, `OTX_API_KEY` (see `.env.example`)
- OTX API key must only be set via the Settings modal in the UI — never pasted in chat

## Known Sensitive Paths
| Path | Content | Access |
|---|---|---|
| `.env` | DB credentials, secret key, API keys | Never read directly by agents |
| `vector/data/` | State files for log collection | Runtime only |
| PostgreSQL `users` table | bcrypt password hashes | Never exposed in API responses |

## Threat Model
This dashboard is a **local-only** tool running on a single analyst workstation. It is not hardened for internet-facing deployment. Risks:

- **Lateral movement via API:** Mitigated by binding to localhost/LAN only
- **SQL injection:** Mitigated by parameterised queries
- **Playbook action abuse:** AD disable / IP block actions require authenticated analyst trigger
- **Log injection:** `raw_log` fields stored as-is; rendered as `<pre>` (not dangerouslySetInnerHTML) so XSS is not possible

## Incident Response (OTX Key Exposure)
If the OTX API key is accidentally shared in chat or a log file:
1. Immediately regenerate at [otx.alienvault.com](https://otx.alienvault.com) → Account → API Key
2. Update the key in the Settings modal (not in `.env` directly)
3. Rotate `SECRET_KEY` in `.env` and restart the API to invalidate all sessions

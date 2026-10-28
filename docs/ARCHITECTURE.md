# Architecture — SOC Dashboard

## Stack

| Layer | Technology | Details |
|---|---|---|
| Frontend | Next.js 15 (App Router) | TypeScript, Tailwind CSS, Recharts, date-fns, lucide-react |
| Backend API | FastAPI (Python 3.14) | Uvicorn, psycopg3, pydantic |
| Database | PostgreSQL | `SOC_DB` on localhost:5432 |
| Log Collector | Vector 0.41.1 | `exec` source → PowerShell script → HTTP sink |
| Log Ingestion | `VectorAgent` Windows Service | Runs as LocalSystem, auto-starts on reboot |

---

## Directory Layout

```
Dashboard/
├── api/
│   ├── index.py              # FastAPI app — all routes, DB init, correlation engine
│   ├── playbook_engine.py    # SOAR playbook execution engine
│   ├── correlation.py        # Batch correlation rule evaluator
│   └── streaming.py          # Streaming log query endpoints
│
├── src/                      # Next.js frontend
│   ├── app/                  # App Router pages
│   │   ├── page.tsx          # Dashboard home
│   │   ├── logs/             # Log Explorer (threat hunting)
│   │   ├── alerts/           # Alert management
│   │   ├── threat-intel/     # TI feeds, OTX, AbuseIPDB
│   │   ├── playbooks/        # SOAR playbook builder
│   │   ├── troubleshooting/  # System health, Vector Agent
│   │   ├── sources/          # Log source integrations
│   │   ├── settings/         # User and system settings
│   │   ├── parsers/          # Custom log parser rules
│   │   ├── reference-sets/   # Watchlists (IP/domain/hash)
│   │   ├── mitre/            # MITRE ATT&CK heatmap
│   │   ├── usecases/         # Correlation use case rules
│   │   └── login/            # Authentication
│   ├── components/           # Shared React components
│   └── lib/
│       ├── types.ts          # TypeScript interfaces
│       ├── mitre-mapping.ts  # EventID → MITRE static map
│       └── mock-data.ts      # Seed/demo data helpers
│
├── vector/
│   ├── vector-windows-agent.toml   # Active Vector config (exec → HTTP sink)
│   ├── collect-events.ps1           # PowerShell event collector script
│   ├── vector-syslog-collector.toml # Syslog config (port 514, not yet active)
│   ├── install-vector-service.ps1   # Service installer
│   └── bin/vector.exe               # Vector binary
│
├── scripts/
│   └── generate_firewall_logs.py   # Load-test / demo log generator
│
├── public/
│   ├── deploy_agent.ps1    # Windows agent deployment helper
│   └── deploy_agent.sh     # Linux agent deployment helper
│
├── docs/                   # Project documentation (this directory)
├── tests/                  # Test suite
└── .cursor/rules/          # Cursor AI coding rules
```

---

## Data Flow

```
Windows Event Log
  └── VectorAgent service (LocalSystem)
        └── collect-events.ps1 (every 30s / 60s)
              └── ndjson output
                    └── Vector HTTP sink
                          └── POST /api/logs/ingest (batch)
                                └── process_log_entry()
                                      ├── IOC check vs threat_indicators
                                      │     └── MATCH → INSERT alert
                                      ├── INSERT INTO logs
                                      └── UPSERT endpoint_agents
```

## API → Frontend

- Next.js proxies `/api/*` to `http://localhost:8001` via `next.config.ts`
- All data fetched client-side with `useSWR` or `fetch` + React state
- No SSR for dashboard pages (all `'use client'`)

## Authentication

- Session-based (JWT stored in cookie via `src/middleware.ts`)
- Login via `POST /api/auth/login`; protected routes redirect to `/login`

## Key Backend Modules

| Module | Role |
|---|---|
| `init_db()` | Creates all tables on startup (idempotent DDL with `IF NOT EXISTS`) |
| `process_log_entry()` | Per-event enrichment: IOC match, severity normalisation, MITRE lookup, endpoint upsert |
| `start_batch_scheduler()` | Runs correlation rules every 5 minutes in background thread |
| `playbook_engine.py` | Evaluates trigger conditions, executes actions (AD disable, IP block, webhook) |
| `streaming.py` | Server-sent events for large log queries without loading all rows into RAM |

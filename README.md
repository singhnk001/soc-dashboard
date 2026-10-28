# SOC Dashboard

A self-hosted Security Operations Centre platform for Windows. Ingests Windows Event Logs in real-time, enriches against 66k+ threat intelligence indicators, auto-generates alerts, and provides analyst-grade threat hunting tools.

## Features

- **Real-time Log Ingestion** — Windows Event Log (Security/System/Application) via Vector agent service
- **Threat Intelligence** — 66k+ IOCs from URLhaus, ThreatFox, CISA KEV, OTX, AbuseIPDB
- **Alert Management** — Auto-created alerts with severity, lifecycle, MITRE mapping, analyst notes
- **Log Explorer** — Server-side filter builder (=, !=, contains, starts_with, in, is_null, ...) + event histogram + event detail panel
- **SOAR Playbooks** — Automated response: AD user disable, IP block, Slack/Teams notification
- **MITRE ATT&CK** — EventID → technique mapping, heatmap visualisation
- **System Health** — Vector Agent status, connected hosts, device criticality levels

## Stack

- **Frontend:** Next.js 15 + TypeScript + Tailwind CSS + Recharts
- **Backend:** FastAPI (Python 3.14) + psycopg3
- **Database:** PostgreSQL (`SOC_DB`)
- **Collector:** Vector 0.41.1 (`exec` source + PowerShell) running as Windows Service

## Quick Start

```powershell
# 1. Copy and fill environment config
copy .env.example .env

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Install Node dependencies
npm install

# 4. Start the API (Terminal 1)
python -m uvicorn api.index:app --host 0.0.0.0 --port 8000 --workers 1

# 5. Start the frontend (Terminal 2)
npm run dev

# 6. Open http://localhost:3000
```

## Log Collection

The `VectorAgent` Windows Service collects events automatically after installation:

```powershell
# Install (run as Administrator once)
.\vector\install-vector-service.ps1

# Check status
Get-Service VectorAgent
```

See `docs/ARCHITECTURE.md` for the full data flow.

## Documentation

| Doc | Contents |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Product requirements, features, data model |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack, directory layout, data flow |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Design system, theme, component conventions |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Auth, secrets, threat model |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Architecture decision records |
| [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) | Smoke tests, regression scenarios |
| [`docs/MEMORY.md`](docs/MEMORY.md) | Known issues, quirks, how to start |
| [`TASKS.md`](TASKS.md) | Feature backlog and done items |

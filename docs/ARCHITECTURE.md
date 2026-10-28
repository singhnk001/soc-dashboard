# Architecture & Engineering Guide — SOC Dashboard

## Overview

The SOC Dashboard is a high-performance Security Operations Center platform with real-time log ingestion, MITRE ATT&CK mapping, IOC correlation, automated SOAR playbooks, and threat intelligence synchronization.

---

## Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Frontend** | Next.js 15 (App Router, Turbopack) | React 19, TypeScript 5, Tailwind CSS, Recharts, date-fns, lucide-react |
| **API Client** | Typed Service Layer (`src/services/`) | Normalized `apiClient`, typed domain services, centralized error handling |
| **Backend API** | FastAPI (Python 3.14/3.15) | Modular APIRouters, Pydantic v2 schemas, lifespan lifecycle |
| **Database** | PostgreSQL (`soc_db`) | Connection pooling (`ConnectionPool`), advisory locking, concurrent indexes |
| **Log Collector** | Vector 0.41.1 + RFC3164 Syslog UDP | Windows Event log forwarding + UDP port 1514 syslog listener |
| **Authentication** | Multi-Factor Auth (TOTP) | PyOTP authenticator challenge, session cookies, role-based access |

---

## Directory Layout

```
Dashboard/
├── api/                             # Scalable Modular FastAPI Backend
│   ├── core/                        # Core backend configuration & database abstractions
│   │   ├── config.py                # Centralized environment configs (settings singleton)
│   │   ├── database.py              # PostgreSQL ConnectionPool, wrapper, and get_db() context
│   │   ├── schema.py                # Idempotent DDL migrations & concurrent indexing
│   │   └── seed.py                  # Default users, parsers, and sample data seeders
│   ├── models/                      # Pydantic v2 domain schemas & validation
│   │   ├── alert.py                 # Alert updates, comments, triage schemas
│   │   ├── auth.py                  # Login, MFA challenge, user management schemas
│   │   ├── log.py                   # Ingestion batch, LogEntry schemas
│   │   ├── parser.py                # Regex parser creation schemas
│   │   ├── playbook.py              # SOAR playbook definition & execution schemas
│   │   ├── reference_set.py         # Watchlist and bulk item schemas
│   │   ├── system.py                # Windows services & health schemas
│   │   ├── threat_intel.py          # Threat feeds, OTX pulse import schemas
│   │   └── usecase.py               # Correlation detection rule schemas
│   ├── routers/                     # Domain-separated APIRouters
│   │   ├── alerts.py                # /api/alerts (list, triage, comments)
│   │   ├── auth.py                  # /api/auth & /api/users (login, MFA, RBAC)
│   │   ├── logs.py                  # /api/logs (search, histogram, ingestion, purge)
│   │   ├── mitre.py                 # /api/mitre (technique mappings)
│   │   ├── parsers.py               # /api/parsers (regex field extraction)
│   │   ├── playbooks.py             # /api/playbooks (SOAR CRUD, execution testing)
│   │   ├── reference_sets.py        # /api/reference-sets (watchlists & bulk items)
│   │   ├── sources.py               # /api/sources (endpoint agents & API sources)
│   │   ├── stats.py                 # /api/stats (KPI metrics, EPS, timelines)
│   │   ├── system.py                # /api/system (health, Windows services, settings)
│   │   ├── threat_intel.py          # /api/threat-feeds & community feeds
│   │   └── usecases.py              # /api/usecases (detection correlation rules)
│   ├── services/                    # Business logic & background workers
│   │   ├── ingestion.py             # Log parsing, IOC matching, SOAR triggering
│   │   ├── scheduler.py             # Feed sync & TTL reference set pruning worker
│   │   ├── settings.py              # Database key-value settings management
│   │   ├── syslog.py                # UDP 1514 RFC3164 Syslog listener
│   │   ├── system.py                # Host services monitoring (sc.exe / psutil)
│   │   └── threat_intel.py          # OTX, VirusTotal, AbuseIPDB, CISA KEV integrations
│   ├── correlation.py               # 5-minute batch rule evaluator
│   ├── playbook_engine.py           # SOAR execution (Slack, Teams, pfSense, AD, SMTP)
│   ├── streaming.py                 # Server-side cursor NDJSON streaming
│   └── index.py                     # Root FastAPI application entrypoint (lifespan, CORS)
│
├── src/                             # Next.js 15 Frontend
│   ├── app/                         # App Router pages (all 'use client')
│   │   ├── page.tsx                 # SOC Overview dashboard & real-time KPIs
│   │   ├── alerts/                  # Security incident triage & comments
│   │   ├── logs/                    # Threat hunting log explorer & histogram
│   │   ├── threat-intel/            # TI feeds, OTX Pulses, IOC live lookup
│   │   ├── playbooks/               # SOAR playbook builder & execution history
│   │   ├── parsers/                 # Regex parser configuration
│   │   ├── reference-sets/          # IOC Watchlists (IP, Domain, Hash)
│   │   ├── usecases/                # Correlation engine rule builder
│   │   ├── mitre/                   # MITRE ATT&CK Matrix & technique coverage
│   │   ├── sources/                 # Connected log sources & API integrations
│   │   ├── troubleshooting/         # System health & Windows service controls
│   │   ├── settings/                # User accounts & TOTP MFA configuration
│   │   └── login/                   # Multi-factor authentication login
│   ├── components/
│   │   ├── common/                  # Reusable UI Primitives
│   │   │   ├── SeverityBadge.tsx    # Standardized color-coded severity pill
│   │   │   ├── StatusBadge.tsx      # Lifecycle status pill
│   │   │   ├── PageHeader.tsx       # Standard title & action header
│   │   │   ├── ErrorMessage.tsx     # Normalized alert error banner
│   │   │   ├── LoadingSpinner.tsx   # Loading indicator
│   │   │   └── EmptyState.tsx       # Standard empty state message
│   │   ├── AlertCard.tsx            # Alert overview widget
│   │   ├── AlertRateWidget.tsx      # Sparkline alert frequency
│   │   ├── EventIdTable.tsx         # Event ID to MITRE mapping table
│   │   ├── MitreHeatmap.tsx         # Heatmap visualization
│   │   ├── SeverityChart.tsx        # Severity breakdown chart
│   │   ├── TimelineChart.tsx        # Ingestion volume timeline
│   │   ├── TopEventsChart.tsx       # Most frequent Windows Event IDs
│   │   └── TopSourcesChart.tsx      # Ingestion by log source
│   ├── hooks/                       # Custom React Query / Polling Hooks
│   │   ├── useDashboardStats.ts     # Auto-polling KPI stats hook
│   │   └── useAlerts.ts             # Live alerts & pagination hook
│   ├── services/                    # Centralized Frontend API Service Layer
│   │   ├── api-client.ts            # Type-safe fetch client with ApiError normalization
│   │   ├── auth.service.ts          # Login, MFA verification, user CRUD
│   │   ├── logs.service.ts          # Search, pagination, histogram, purging
│   │   ├── alerts.service.ts        # Incident triage, notes, comments
│   │   ├── threat-intel.service.ts  # Threat feeds, OTX pulse browsing, IOC lookup
│   │   ├── playbooks.service.ts     # Playbook CRUD & test execution
│   │   ├── system.service.ts        # Health check, Windows services, settings
│   │   ├── sources.service.ts       # Connected hosts & API sources
│   │   ├── parsers.service.ts       # Regex log parsers
│   │   ├── usecases.service.ts      # Correlation rules
│   │   └── reference-sets.service.ts# Watchlists & bulk indicator imports
│   └── lib/
│       ├── config.ts                # App constants, badge tokens, color maps
│       ├── types.ts                 # Authoritative TypeScript data contracts
│       ├── mitre-mapping.ts         # Static MITRE ATT&CK reference data
│       └── mock-data.ts             # Demo data generator
│
├── vector/                          # Vector Telemetry Ingestion
│   ├── vector-windows-agent.toml    # Windows Event Log forwarder
│   └── collect-events.ps1           # Event log query script
├── docs/                            # Architecture & design documentation
└── next.config.ts                   # Next.js proxy rewrites (/api/* -> FastAPI :8002)
```

---

## Ingestion & Correlation Pipeline

```
1. Ingestion Sources
   ├── Windows Event Log (VectorAgent service -> collect-events.ps1)
   ├── UDP Syslog (RFC3164 on 0.0.0.0:1514)
   └── API Sources (CrowdStrike, Cloudflare, Office 365, AWS)
          │
          ▼
2. POST /api/logs/ingest (Batch or Streaming)
   └── process_log_entry()
         ├── Custom Regex Parser extraction (named capture groups)
         ├── Automated IOC Extraction (IPv4, Domains, SHA256, MD5)
         ├── Threat Indicator Match check (threat_indicators table)
         │     └── MATCH → Automatically creates Alert (severity: High/Critical)
         ├── Correlation Engine check (Threshold & Sequence rules)
         │     └── TRIGGER → Creates Alert & executes SOAR Playbook
         ├── INSERT INTO logs (Indexed timestamp, host, event_id, severity)
         └── UPSERT endpoint_agents (Last seen, status, agent version)
```

---

## Security & Resilience Guarantees

1. **Advisory Locked Migrations:**
   - Multi-worker Uvicorn startups acquire `pg_try_advisory_lock(8675309)` so only one worker executes database migrations and concurrent index creation, eliminating database table contention.
2. **Environment Variable Protection:**
   - Configuration is strictly isolated via `api/core/config.py` using `.env`. Sensitive credential files are ignored via `.gitignore` (`.env`, `.env.local`, `.env.*`, except `.env.example`).
3. **MFA Authentication:**
   - TOTP MFA challenges are enforced via `pyotp` with QR code provisioning and backup secret reset controls.
4. **Resilient Connection Pooling:**
   - `api/core/database.py` manages a pooled PostgreSQL connection manager with automatic cursor wrappers (`PgConnWrapper`, `PgCursorWrapper`), preventing connection exhaustion under heavy EPS spikes.

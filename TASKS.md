# Tasks — SOC Dashboard

## In Progress
- [ ] UEBA / Behavioral Analytics engine (baseline profiling, anomaly detection)

## Backlog — Features
- [ ] UEBA: time-of-day baseline per user, impossible travel detection
- [ ] UEBA: new IP / rare hostname alerts
- [ ] Alerts page: server-side filtering (same pattern as Log Explorer)
- [ ] Syslog listener activation (port 514) for network device logs
- [ ] Log Explorer: saved searches / hunt templates
- [ ] Log Explorer: "Add to Reference Set" from event detail panel
- [ ] Playbooks: test-run mode (dry-run without executing action)
- [ ] Dashboard home: real-time event rate gauge
- [ ] API: `/api/logs/histogram` endpoint for standalone chart queries

## Backlog — Technical Debt
- [ ] Move `init_db()` out of module scope into `@app.on_event("startup")` to support multi-worker safely
- [ ] Add `tests/` test suite (pytest for API, Playwright for frontend smoke)
- [ ] `src/lib/mock-data.ts` — replace with API-backed fallbacks; remove demo data from production path
- [ ] `vector/collect-events.ps1` — add retry logic on transient Security log access failures
- [ ] `api/index.py` is 186k bytes — split into routers: `auth.py`, `logs.py`, `alerts.py`, `ti.py`, `system.py`

## Done (recent)
- [x] Log Explorer complete rewrite — server-side filter builder, histogram, event detail slide-over
- [x] SOAR Playbooks page + backend engine
- [x] Device criticality (Low/Medium/High/Critical) per connected host
- [x] Vector Agent GUI controls (Start/Stop) with service + process fallback
- [x] Advanced filter operators: =, !=, contains, starts_with, ends_with, in, is_null, >, <, >=, <=
- [x] PostgreSQL migration (from SQLite)
- [x] Windows Event ID → Event Name mapping (260+ IDs)
- [x] TI feed auto-alert on IOC match
- [x] OTX AlienVault + AbuseIPDB integration
- [x] Project cleanup — removed 40+ stale scripts, SQLite files, test vectors, Grafana, TimescaleDB

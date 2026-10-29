# Test Plan — SOC Dashboard

## Test Strategy
Manual smoke tests for now. Automated tests go in `tests/`.

---

## API Smoke Tests (run after any API restart)

```powershell
$BASE = "http://127.0.0.1:8000"

# Health
Invoke-RestMethod "$BASE/api/system/health"           # expect {status: "ok"}

# Logs
Invoke-RestMethod "$BASE/api/logs?limit=2"            # expect {total: >0, data: [...], histogram: [...]}

# Advanced filter
Invoke-RestMethod "$BASE/api/logs?limit=5&severity=high"
Invoke-RestMethod "$BASE/api/logs?limit=5&search=4624"

# Alerts
Invoke-RestMethod "$BASE/api/alerts?limit=2"          # expect list

# TI indicators
Invoke-RestMethod "$BASE/api/threat-intel/indicators?limit=2"

# Vector agents
Invoke-RestMethod "$BASE/api/system/vector/agents"    # expect {agents: [...]}

# Services
Invoke-RestMethod "$BASE/api/system/services"         # expect list with vector-agent
```

---

## Frontend Smoke Tests (manual, browser)

| Page | What to verify |
|---|---|
| `/` (Dashboard) | Stats cards load, charts render, no "NaN" values |
| `/logs` | Log table loads with data on first open (All Time default), histogram shows, filter builder works |
| `/alerts` | Alert list loads, status filter works, expand shows details |
| `/threat-intel` | Feed counts show, OTX tab loads (may be slow) |
| `/troubleshooting` | Vector Agent shows Running, DESKTOP-3BEJ849 in hosts list |
| `/playbooks` | Playbook list loads, create/edit form opens |
| `/settings` | Settings load, API key modal opens |

---

## Log Ingestion Test

```powershell
# Send 1 test event directly to ingest endpoint
$body = @{
  timestamp = (Get-Date -Format "o")
  source = "Security"
  event_id = "4625"
  severity = "high"
  message = "Test: Failed logon from 192.168.1.100"
  hostname = "DESKTOP-3BEJ849"
  username = "testuser"
  source_ip = "192.168.1.100"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/logs/ingest" -Method Post -Body $body -ContentType "application/json"
# Then check /logs page — event should appear with IOC check result
```

---

## Key Regression Scenarios

1. **Vector stops and restarts** — log count should resume incrementing; no duplicate entries
2. **API restart** — `init_db()` must complete without locks; all endpoints return 200 within 15s
3. **Large filter query** — `filters` JSON with 3 rows + AND/OR must return correct subset
4. **IOC match** — ingest a log with a known bad IP from `threat_indicators` → alert auto-created
5. **Criticality assignment** — set host criticality to Critical, refresh page → persists

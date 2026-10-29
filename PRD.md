# Product Requirements Document — SOC Dashboard

## Overview
A self-hosted Security Operations Centre (SOC) dashboard running entirely on a Windows workstation (`DESKTOP-3BEJ849`). The platform ingests Windows Event Logs in real-time via a Vector agent service, enriches them against 66k+ threat intelligence indicators, auto-creates alerts, and provides an analyst-grade UI for threat hunting, alert triage, and incident response.

## Goals
- Real-time visibility into Windows Security / System / Application event logs
- Automated IOC matching and alert generation
- Analyst workflows: log search, alert investigation, MITRE ATT&CK mapping
- SOAR playbooks for automated response actions
- Extensible to network device syslog (port 514)

## Non-Goals
- Cloud deployment (runs locally on Windows)
- Multi-tenancy
- SIEM replacement (complements, not replaces)

---

## Core Features

### 1. Log Ingestion
- **Source:** Windows Event Log (Security, System, Application) via `VectorAgent` Windows service
- **Collector:** `vector/collect-events.ps1` polled by Vector (`vector/vector-windows-agent.toml`)
- **Endpoint:** `POST /api/logs/ingest` (batch, up to 100 events per call)
- **Schema:** `logs` table in PostgreSQL `SOC_DB`
- **Status:** ✅ Active — 262k+ events ingested as of Oct 2026

### 2. Threat Intelligence Enrichment
- **Feeds:** SSH Brute-Force Honeypot, URLhaus, ThreatFox, CISA KEV, TSEC Honeypot (~66k IOCs)
- **Integration:** AlienVault OTX (pulses, IOC search), AbuseIPDB (IP reputation)
- **Auto-alert:** Every ingested log is checked against `threat_indicators` table; match → alert created

### 3. Alert Management
- Severity: Critical / High / Medium / Low
- Lifecycle: Open → In Progress → Resolved / False Positive
- Comments, analyst notes, raw log attachment, MITRE mapping

### 4. Log Explorer (Threat Hunting)
- Server-side filtering: field + operator (=, !=, contains, starts_with, ends_with, in, is_null, >, <, >=, <=) + AND/OR
- Event histogram (per-hour bar chart)
- Event detail slide-over with all parsed attributes
- Clickable IPs → instant filter
- Export CSV, column picker, auto-refresh

### 5. MITRE ATT&CK
- Event ID → tactic/technique mapping
- Heatmap visualisation

### 6. SOAR Playbooks
- Trigger conditions: alert severity, event type, IOC match
- Actions: AD user disable, IP block, Slack/Teams webhook notification
- Execution log per playbook run

### 7. Troubleshooting / System Health
- Vector Agent status (Windows Service + process fallback)
- Connected hosts with last-seen time, log count, user-assigned criticality (Low/Medium/High/Critical)
- Log Sources & Integrations panel

---

## Data Model (PostgreSQL `SOC_DB`)
| Table | Purpose |
|---|---|
| `logs` | All ingested events |
| `alerts` | Generated alerts |
| `alert_comments` | Analyst notes on alerts |
| `threat_indicators` | IOC feed data |
| `threat_feeds` | Feed metadata and sync schedule |
| `endpoint_agents` | Connected hosts (upserted on log ingestion) |
| `device_criticality` | Per-host criticality level |
| `playbooks` | Playbook definitions |
| `playbook_executions` | Execution history |
| `users` | Dashboard user accounts |
| `settings` | Key-value config store |
| `parsers` | Custom log parser rules |
| `reference_sets` | IP/domain/hash watchlists |
| `mitre_mappings` | EventID → MITRE mapping |
| `use_cases` | Correlation rule definitions |

---

## Personas
- **Primary:** Senior SOC Analyst (threat hunting, alert triage, playbook management)
- **Secondary:** SOC Manager (dashboard overview, feed management)

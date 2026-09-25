# API Reference

## Base URL
`/api`

## Authentication
Currently unauthenticated. API Keys planned for future.

## Endpoints

### GET /api/health
Returns system health status.

### POST /api/logs/ingest
Ingests a new log entry.
**Body:**
```json
{
  "event_id": 4625,
  "source": "Windows",
  "message": "Failed Logon",
  "timestamp": "2026-09-24T10:00:00Z"
}
```

### GET /api/logs
Retrieves logs.
**Query Params:**
- `page`: Page number
- `limit`: Items per page
- `severity`: Filter by severity

### GET /api/stats
Returns statistics for dashboard charts.

## Example Requests
```bash
curl -X GET http://localhost:8000/api/health
```

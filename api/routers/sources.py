"""
api/routers/sources.py
======================
Log sources, connected hosts, Vector endpoint agents, and host criticality.
"""

import datetime as _dt
import uuid
from fastapi import APIRouter, HTTPException
from api.core.database import get_db
from api.models.system import DeviceCriticalityRequest, ApiSourceCreate

router = APIRouter(tags=["Sources & Agents"])

@router.get("/api/sources")
def get_sources():
    """Return all real connected host sources with health status and metadata."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                l.hostname,
                STRING_AGG(DISTINCT l.source, ', ')  AS sources,
                MAX(l.timestamp)                      AS last_seen,
                MIN(l.timestamp)                      AS first_seen,
                COUNT(*)                              AS total_events,
                a.ip_address,
                a.os_version,
                a.protocol,
                a.agent_version,
                a.link_speed,
                a.eps
            FROM logs l
            LEFT JOIN endpoint_agents a ON l.hostname = a.hostname
            WHERE l.hostname IS NOT NULL AND l.hostname != ''
            GROUP BY l.hostname, a.ip_address, a.os_version, a.protocol, a.agent_version, a.link_speed, a.eps
            ORDER BY last_seen DESC
        """)
        rows = cursor.fetchall()

    sources = []
    for r in rows:
        hostname = r['hostname']
        last_seen = r['last_seen']
        first_seen = r['first_seen']

        try:
            if hasattr(last_seen, 'timestamp'):
                age_secs = (_dt.datetime.now(_dt.timezone.utc) - last_seen.astimezone(_dt.timezone.utc)).total_seconds()
            else:
                ls = _dt.datetime.fromisoformat(str(last_seen).replace(' ', 'T'))
                if ls.tzinfo is None:
                    ls = ls.replace(tzinfo=_dt.timezone.utc)
                age_secs = (_dt.datetime.now(_dt.timezone.utc) - ls).total_seconds()
            status = 'healthy' if age_secs < 3600 else 'inactive'
        except Exception:
            status = 'unknown'

        def _ts(val):
            if val is None:
                return None
            if hasattr(val, 'isoformat'):
                return val.isoformat()
            s = str(val).strip()
            return (s[:10] + 'T' + s[11:]) if len(s) >= 19 and s[10] == ' ' else s

        sources.append({
            "hostname":      hostname,
            "source":        r['sources'],
            "lastSeen":      _ts(last_seen),
            "firstSeen":     _ts(first_seen),
            "totalEvents":   int(r['total_events']) if r['total_events'] else 0,
            "status":        status,
            "ip_address":    r['ip_address'],
            "os_version":    r['os_version'],
            "protocol":      r['protocol'],
            "agent_version": r['agent_version'],
            "link_speed":    r['link_speed'],
            "eps":           r['eps'],
        })
    return sources

@router.delete("/api/sources/{hostname}")
def delete_source(hostname: str):
    """Remove a source host and delete associated telemetry."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM logs WHERE hostname = %s", (hostname,))
        cursor.execute("DELETE FROM endpoint_agents WHERE hostname = %s", (hostname,))
        conn.commit()
    return {"status": "success"}

@router.patch("/api/sources/{hostname}")
def update_source(hostname: str, req: dict):
    """Update metadata for an endpoint agent."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM endpoint_agents WHERE hostname = %s", (hostname,))
        if cursor.fetchone():
            cursor.execute(
                "UPDATE endpoint_agents SET ip_address=%s, os_version=%s, protocol=%s, agent_version=%s, link_speed=%s WHERE hostname=%s",
                (req.get('ip_address'), req.get('os_version'), req.get('protocol'), req.get('agent_version'), req.get('link_speed'), hostname)
            )
        else:
            cursor.execute(
                "INSERT INTO endpoint_agents (hostname, ip_address, os_version, protocol, agent_version, link_speed) VALUES (%s, %s, %s, %s, %s, %s)",
                (hostname, req.get('ip_address'), req.get('os_version'), req.get('protocol'), req.get('agent_version'), req.get('link_speed'))
            )
        conn.commit()
    return {"status": "success"}

@router.get("/api/system/vector/agents")
def get_vector_agents():
    """Retrieve detailed statistics and criticality levels for all connected hosts."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                hostname,
                COUNT(*)                                                        AS log_count,
                MAX(timestamp)                                                  AS last_seen,
                MIN(timestamp)                                                  AS first_seen,
                SUM(CASE WHEN LOWER(severity) = 'critical' THEN 1 ELSE 0 END)   AS critical_count,
                SUM(CASE WHEN LOWER(severity) = 'high'     THEN 1 ELSE 0 END)   AS high_count,
                SUM(CASE WHEN LOWER(severity) = 'medium'   THEN 1 ELSE 0 END)   AS medium_count,
                SUM(CASE WHEN LOWER(severity) = 'low'      THEN 1 ELSE 0 END)   AS low_count
            FROM logs
            WHERE hostname IS NOT NULL AND hostname != ''
            GROUP BY hostname
            ORDER BY last_seen DESC
        """)
        rows = cursor.fetchall()
        now_ts = _dt.datetime.now(_dt.timezone.utc).timestamp()

        def _to_iso(val):
            if val is None:
                return None
            if hasattr(val, 'isoformat'):
                return val.isoformat()
            s = str(val).strip()
            return (s[:10] + 'T' + s[11:]) if len(s) >= 19 and s[10] == ' ' else s

        agents = []
        for row in rows:
            hostname = row['hostname']
            last_seen = row['last_seen']
            try:
                if hasattr(last_seen, 'timestamp'):
                    last_ts = last_seen.timestamp()
                else:
                    s = str(last_seen).strip().replace(' ', 'T')
                    parsed = _dt.datetime.fromisoformat(s)
                    if parsed.tzinfo is None:
                        parsed = parsed.replace(tzinfo=_dt.timezone.utc)
                    last_ts = parsed.timestamp()
                age_mins = (now_ts - last_ts) / 60
                sync_status = "live" if age_mins < 5 else ("recent" if age_mins < 30 else "stale")
            except Exception:
                sync_status = "unknown"

            agents.append({
                "hostname":    hostname,
                "log_count":   int(row['log_count'] or 0),
                "last_seen":   _to_iso(last_seen),
                "first_seen":  _to_iso(row['first_seen']),
                "sync_status": sync_status,
                "severity_breakdown": {
                    "critical": int(row['critical_count'] or 0),
                    "high":     int(row['high_count'] or 0),
                    "medium":   int(row['medium_count'] or 0),
                    "low":      int(row['low_count'] or 0),
                }
            })

        # Enrich with criticality if table exists
        try:
            cursor.execute("SELECT hostname, criticality FROM endpoint_agents")
            crit_map = {r['hostname']: r['criticality'] for r in cursor.fetchall()}
            for a in agents:
                a['criticality'] = crit_map.get(a['hostname'], 'medium')
        except Exception:
            for a in agents:
                a['criticality'] = 'medium'

    return {"data": agents}

@router.patch("/api/system/vector/agents/{hostname}/criticality")
def set_device_criticality(hostname: str, req: DeviceCriticalityRequest):
    """Update criticality score for a host."""
    valid = {'low', 'medium', 'high', 'critical'}
    if req.criticality.lower() not in valid:
        raise HTTPException(status_code=400, detail=f"Criticality must be one of {sorted(valid)}")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO endpoint_agents (hostname, criticality, last_seen)
            VALUES (%s, %s, NOW())
            ON CONFLICT (hostname) DO UPDATE
                SET criticality = EXCLUDED.criticality
        """, (hostname, req.criticality.lower()))
        conn.commit()
    return {"status": "success", "hostname": hostname, "criticality": req.criticality.lower()}

@router.get("/api/api-sources")
def get_api_sources():
    """Retrieve all configured external API log collectors."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, type, name, config, status, created_at FROM api_sources ORDER BY created_at DESC")
        rows = cursor.fetchall()
    return {"data": [dict(r) for r in rows]}

@router.post("/api/api-sources")
def create_api_source(source: ApiSourceCreate):
    """Register an external API ingestion source."""
    source_id = str(uuid.uuid4())
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO api_sources (id, type, name, config) VALUES (%s, %s, %s, %s)",
            (source_id, source.type, source.name, source.config)
        )
        conn.commit()
    return {"status": "success", "id": source_id}

@router.delete("/api/api-sources/{source_id}")
def delete_api_source(source_id: str):
    """Delete an API log source."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM api_sources WHERE id = %s", (source_id,))
        conn.commit()
    return {"status": "success"}

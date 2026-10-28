"""
api/routers/logs.py
===================
Log ingestion, advanced server-side search, histograms, and retention purging.
"""

import json
from typing import Optional
from fastapi import APIRouter, Request, Query, HTTPException
from api.core.database import get_db
from api.models.log import LogEntry
from api.services.ingestion import process_log_entry

router = APIRouter(tags=["Logs & Ingestion"])

@router.post("/api/logs/ingest")
async def ingest_logs(request: Request):
    """
    Ingest logs from Vector / external forwarders.
    Accepts JSON Array, Newline-Delimited JSON (ndjson), or single JSON Object.
    """
    raw = await request.body()
    text = raw.decode("utf-8", errors="replace").strip()
    if not text:
        return {"status": "ok", "ingested": 0}

    entries_raw = []
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            entries_raw = parsed
        elif isinstance(parsed, dict):
            entries_raw = [parsed]
    except json.JSONDecodeError:
        for line in text.splitlines():
            line = line.strip()
            if line:
                try:
                    entries_raw.append(json.loads(line))
                except json.JSONDecodeError:
                    pass

    if not entries_raw:
        return {"status": "ok", "ingested": 0}

    entries = []
    for raw_entry in entries_raw:
        try:
            mapped = {k: v for k, v in raw_entry.items() if k in LogEntry.model_fields}
            if "raw_log" in raw_entry:
                rl = raw_entry["raw_log"]
                mapped["raw_log"] = json.dumps(rl) if isinstance(rl, dict) else str(rl)

            if not mapped.get("username"):
                rl_obj = None
                if isinstance(raw_entry.get("raw_log"), dict):
                    rl_obj = raw_entry["raw_log"]
                elif isinstance(raw_entry.get("raw_log"), str) and raw_entry["raw_log"].startswith("{"):
                    try:
                        rl_obj = json.loads(raw_entry["raw_log"])
                    except Exception:
                        pass
                if rl_obj:
                    ef = rl_obj.get("extracted_fields", {})
                    mapped["username"] = ef.get("username") or ef.get("subject_username") or None

            if "mitre_tactics" in raw_entry:
                v = raw_entry["mitre_tactics"]
                mapped["mitre_tactics"] = v if isinstance(v, list) else []
            if "mitre_techniques" in raw_entry:
                v = raw_entry["mitre_techniques"]
                mapped["mitre_techniques"] = v if isinstance(v, list) else []

            entries.append(LogEntry(**mapped))
        except Exception:
            pass

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name, regex FROM parsers WHERE active = true")
        active_parsers = cursor.fetchall()
        cursor.execute(
            "SELECT id, title, type, event_id, severity, mitre_technique, threshold_count FROM use_cases WHERE active = true"
        )
        active_usecases = cursor.fetchall()

        for entry in entries:
            process_log_entry(entry, conn, active_parsers, active_usecases)

        conn.commit()

    return {"status": "ok", "ingested": len(entries)}

@router.get("/api/logs")
def get_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    severity: Optional[str] = None,
    search: Optional[str] = None,
    hostname: Optional[str] = None,
    source_ip: Optional[str] = None,
    dest_ip: Optional[str] = None,
    event_id: Optional[str] = None,
    source: Optional[str] = None,
    username: Optional[str] = None,
    time_from: Optional[str] = None,
    time_to: Optional[str] = None,
    filters: Optional[str] = None,
):
    """Retrieve stored logs with server-side pagination, full-text, and multi-condition field filters."""
    conditions = []
    params: list = []

    if severity and severity.lower() != "all":
        conditions.append("LOWER(severity) = LOWER(%s)")
        params.append(severity)
    if search:
        conditions.append(
            "(message ILIKE %s OR hostname ILIKE %s OR CAST(event_id AS TEXT) ILIKE %s "
            "OR username ILIKE %s OR source_ip ILIKE %s OR destination_ip ILIKE %s)"
        )
        params.extend([f"%{search}%"] * 6)
    if hostname:
        conditions.append("hostname ILIKE %s")
        params.append(f"%{hostname}%")
    if source_ip:
        conditions.append("source_ip ILIKE %s")
        params.append(f"%{source_ip}%")
    if dest_ip:
        conditions.append("destination_ip ILIKE %s")
        params.append(f"%{dest_ip}%")
    if event_id:
        conditions.append("CAST(event_id AS TEXT) = %s")
        params.append(str(event_id))
    if source:
        conditions.append("source ILIKE %s")
        params.append(f"%{source}%")
    if username:
        conditions.append("username ILIKE %s")
        params.append(f"%{username}%")
    if time_from:
        conditions.append("timestamp >= %s")
        params.append(time_from)
    if time_to:
        conditions.append("timestamp <= %s")
        params.append(time_to)

    FIELD_MAP = {
        "source_ip":      "source_ip",
        "dest_ip":        "destination_ip",
        "destination_ip": "destination_ip",
        "hostname":       "hostname",
        "username":       "username",
        "severity":       "severity",
        "event_id":       "CAST(event_id AS TEXT)",
        "source":         "source",
        "message":        "message",
        "log_type":       "log_type",
        "timestamp":      "timestamp",
    }
    if filters:
        try:
            filter_list = json.loads(filters)
            advanced_parts = []
            for f in filter_list:
                field = FIELD_MAP.get(f.get("field", "").lower())
                op = f.get("op", "contains").lower()
                val = f.get("value", "")
                if not field:
                    continue
                if op in ("=", "equals"):
                    advanced_parts.append(f"LOWER({field}) = LOWER(%s)")
                    params.append(str(val))
                elif op in ("!=", "not_equals"):
                    advanced_parts.append(f"LOWER({field}) != LOWER(%s)")
                    params.append(str(val))
                elif op == "contains":
                    advanced_parts.append(f"{field} ILIKE %s")
                    params.append(f"%{val}%")
                elif op == "not_contains":
                    advanced_parts.append(f"({field} IS NULL OR {field} NOT ILIKE %s)")
                    params.append(f"%{val}%")
                elif op == "starts_with":
                    advanced_parts.append(f"{field} ILIKE %s")
                    params.append(f"{val}%")
                elif op == "ends_with":
                    advanced_parts.append(f"{field} ILIKE %s")
                    params.append(f"%{val}")
                elif op == ">":
                    advanced_parts.append(f"{field} > %s")
                    params.append(val)
                elif op == "<":
                    advanced_parts.append(f"{field} < %s")
                    params.append(val)
                elif op == ">=":
                    advanced_parts.append(f"{field} >= %s")
                    params.append(val)
                elif op == "<=":
                    advanced_parts.append(f"{field} <= %s")
                    params.append(val)
                elif op == "is_null":
                    advanced_parts.append(f"({field} IS NULL OR {field} = '')")
                elif op == "is_not_null":
                    advanced_parts.append(f"({field} IS NOT NULL AND {field} != '')")
                elif op == "in":
                    vals = [v.strip() for v in str(val).split(",") if v.strip()]
                    if vals:
                        placeholders = ",".join(["%s"] * len(vals))
                        advanced_parts.append(f"LOWER({field}) IN ({placeholders})")
                        params.extend([v.lower() for v in vals])
            if advanced_parts:
                conditions.extend(advanced_parts)
        except Exception:
            pass

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM logs {where}", params)
        total = cur.fetchone()["count"]

        hist_where = where if where else "WHERE timestamp >= NOW() - INTERVAL '24 hours'"
        if where:
            hist_where = where + " AND timestamp >= NOW() - INTERVAL '24 hours'"
        cur.execute(
            f"""SELECT DATE_TRUNC('hour', timestamp) AS hour, COUNT(*) AS cnt
                FROM logs {hist_where}
                GROUP BY hour ORDER BY hour""",
            params,
        )
        histogram = [
            {"time": str(row["hour"]), "count": int(row["cnt"])}
            for row in cur.fetchall()
        ]

        offset = (page - 1) * limit
        cur.execute(
            f"""SELECT id, timestamp, source, event_id, severity, message,
                       hostname, username, raw_log, mitre_tactics, mitre_techniques,
                       source_ip, destination_ip, log_type
                FROM logs {where} ORDER BY timestamp DESC LIMIT %s OFFSET %s""",
            params + [limit, offset],
        )
        rows = cur.fetchall()

    formatted_logs = []
    for r in rows:
        tactics = json.loads(r["mitre_tactics"]) if r["mitre_tactics"] else []
        techniques = json.loads(r["mitre_techniques"]) if r["mitre_techniques"] else []
        try:
            raw_log_obj = json.loads(r["raw_log"]) if (r["raw_log"] and str(r["raw_log"]).startswith("{")) else r["raw_log"]
        except Exception:
            raw_log_obj = r["raw_log"]

        raw_sev = (r["severity"] or "info").lower()
        norm_sev = "medium" if raw_sev == "warning" else "high" if raw_sev == "error" else raw_sev
        ts_val = r["timestamp"]
        ts_str = ts_val.isoformat() if hasattr(ts_val, "isoformat") else str(ts_val) if ts_val else None

        formatted_logs.append({
            "id":            r["id"],
            "timestamp":     ts_str,
            "source":        r["source"],
            "eventId":       r["event_id"],
            "logType":       r["log_type"] or "Windows Event",
            "severity":      norm_sev,
            "sourceIp":      r["source_ip"],
            "destinationIp": r["destination_ip"],
            "message":       r["message"],
            "hostname":      r["hostname"],
            "username":      r["username"],
            "rawLog":        raw_log_obj,
            "mitreTactic":   tactics[0] if tactics else None,
            "mitreTechnique":techniques[0] if techniques else None,
        })

    return {
        "data": formatted_logs,
        "total": total,
        "page": page,
        "limit": limit,
        "histogram": histogram
    }

@router.delete("/api/logs/purge")
def purge_old_logs(days: int = Query(30, ge=1)):
    """Purge logs older than N days for retention management."""
    with get_db() as conn:
        cursor = conn.execute(
            "DELETE FROM logs WHERE timestamp < CURRENT_TIMESTAMP + CAST(%s AS INTERVAL)",
            [f"-{days} days"]
        )
        deleted = cursor.rowcount
        conn.commit()
    return {"status": "purged", "deleted": deleted, "retention_days": days}

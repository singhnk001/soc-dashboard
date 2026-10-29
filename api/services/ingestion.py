"""
api/services/ingestion.py
=========================
Log entry processing, enrichment, IOC matching, and detection routing.
"""

import uuid
import json
import re
import psycopg
from api.core.config import settings
from api.models.log import LogEntry
from api.correlation import engine as correlation_engine
from api.playbook_engine import execute_playbook, should_trigger

PRIVATE_IP_RE = re.compile(
    r'^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.0\.0\.0|255\.255)'
)

def process_log_entry(entry: LogEntry, conn, active_parsers: list, active_usecases: list) -> str:
    """Core logic to parse, enrich, match IOCs, evaluate detection rules, and persist a log entry."""
    cursor = conn.cursor()
    src_ip = entry.source_ip or None
    dest_ip = entry.destination_ip or None

    # Pull src_ip/dest_ip from structured extracted_fields in raw_log if present
    raw_obj = None
    if entry.raw_log and entry.raw_log.startswith("{"):
        try:
            raw_obj = json.loads(entry.raw_log)
        except Exception:
            pass
            
    if raw_obj:
        ef = raw_obj.get("extracted_fields", {})
        src_ip = src_ip or ef.get("src_ip") or None
        dest_ip = dest_ip or ef.get("dest_ip") or None

    # Fallback: regex search on message text or raw_log
    if not src_ip:
        src_match = (
            re.search(r'Source Network Address:\s*([\d\.]+)', entry.message)
            or re.search(r'src_?ip[=:]\s*"?([\d\.]+)', entry.raw_log or '')
            or re.search(r'src_?ip[=:]\s*"?([\d\.]+)', entry.message)
        )
        if src_match:
            src_ip = src_match.group(1)

    if not dest_ip:
        dest_match = (
            re.search(r'Dest(?:ination)? Network Address:\s*([\d\.]+)', entry.message)
            or re.search(r'dst_?ip[=:]\s*"?([\d\.]+)', entry.raw_log or '')
            or re.search(r'dst_?ip[=:]\s*"?([\d\.]+)', entry.message)
        )
        if dest_match:
            dest_ip = dest_match.group(1)

    # Last resort: first two public IPs found anywhere in message
    if not src_ip:
        ips = re.findall(r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b', entry.message)
        ips = [ip for ip in ips if ip not in ('127.0.0.1', '0.0.0.0', '255.255.255.255')]
        if ips:
            src_ip = ips[0]
            if len(ips) > 1 and not dest_ip:
                dest_ip = ips[1]

    log_id = str(uuid.uuid4())
    mitre_tactics_json = json.dumps(entry.mitre_tactics or [])
    mitre_techniques_json = json.dumps(entry.mitre_techniques or [])
    raw_log = entry.raw_log or ""
    
    # Apply custom regex parsers
    if active_parsers:
        try:
            raw_data = json.loads(raw_log) if raw_log.startswith("{") else {"original_line": raw_log, "extracted_fields": {}}
            if "extracted_fields" not in raw_data:
                raw_data["extracted_fields"] = {}
                
            for parser in active_parsers:
                match = re.search(parser["regex"], entry.raw_log or "") or re.search(parser["regex"], entry.message or "")
                if match:
                    groups = {k: v for k, v in match.groupdict().items() if v is not None}
                    raw_data["extracted_fields"].update(groups)
                    
            raw_log = json.dumps(raw_data)
        except Exception:
            pass 

    computed_log_type = entry.log_type or ("Firewall" if "fortinet" in (entry.source or "").lower() else "Security Telemetry")
    cursor.execute("""
        INSERT INTO logs (id, timestamp, source, event_id, severity, message, hostname, username, raw_log, mitre_tactics, mitre_techniques, source_ip, destination_ip, log_type)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        log_id, entry.timestamp, entry.source, entry.event_id, entry.severity, 
        entry.message, entry.hostname, entry.username, raw_log, 
        mitre_tactics_json, mitre_techniques_json, src_ip, dest_ip, computed_log_type
    ))

    # Auto-register / update endpoint_agents in separate connection
    if entry.hostname:
        try:
            ea_conn = psycopg.connect(
                host=settings.DB_HOST, port=settings.DB_PORT,
                user=settings.DB_USER, password=settings.DB_PASSWORD,
                dbname=settings.DB_NAME
            )
            ea_conn.autocommit = True
            ea_cur = ea_conn.cursor()
            ea_cur.execute("""
                INSERT INTO endpoint_agents (hostname, protocol, agent_version, link_speed, last_seen)
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT (hostname) DO UPDATE
                    SET protocol      = EXCLUDED.protocol,
                        agent_version = EXCLUDED.agent_version,
                        last_seen     = NOW()
            """, (entry.hostname, "Vector/HTTP", "0.41.1", "1 Gbps"))
            ea_conn.close()
        except Exception:
            pass

    # TI IOC Auto-Detection: Match public IPs, hashes, domains against threat_indicators
    try:
        combined_text = " ".join(filter(None, [
            entry.message or "", entry.raw_log or "",
            entry.hostname or "", entry.username or ""
        ]))
        
        ips = [
            ip for ip in re.findall(r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b', combined_text)
            if ip not in ('0.0.0.0', '255.255.255.255') and not PRIVATE_IP_RE.match(ip)
        ]
        sha256 = re.findall(r'\b[0-9a-fA-F]{64}\b', combined_text)
        md5 = re.findall(r'\b[0-9a-fA-F]{32}\b', combined_text)
        domains = re.findall(
            r'\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|io|ru|cn|de|uk|fr|info|biz|xyz|top|club|online|site|tk|ml|ga|cf|gq)\b',
            combined_text
        )
        urls = re.findall(r'https?://[^\s"\'<>]+', combined_text)
        iocs = list(dict.fromkeys(ips + sha256 + md5 + domains + urls))[:40]

        if iocs:
            placeholders = ",".join(["%s"] * len(iocs))
            ti_rows = cursor.execute(
                f"""SELECT DISTINCT ti.indicator, ti.type, tf.name
                    FROM threat_indicators ti
                    JOIN threat_feeds tf ON ti.feed_id = tf.id
                    WHERE ti.indicator IN ({placeholders})
                       OR SPLIT_PART(ti.indicator, ':', 1) IN ({placeholders})
                    LIMIT 10""",
                iocs + iocs
            ).fetchall()

            if ti_rows:
                hit_lines = [f"{r[0]} ({r[1]}) — {r[2]}" for r in ti_rows]
                hit_summary = "; ".join(hit_lines[:5])
                ioc_types = list({r[1] for r in ti_rows})
                ti_sev = "critical" if any(t in ("sha256_hash", "md5_hash", "malware_download") for t in ioc_types) else "high"
                ti_alert_title = f"[TI Match] {len(ti_rows)} IOC{'s' if len(ti_rows) > 1 else ''} matched on {entry.hostname or entry.source}"
                ti_description = (
                    f"Threat Intelligence auto-detection fired on log from {entry.hostname or 'unknown host'}.\n"
                    f"Matched IOCs: {hit_summary}\n"
                    f"Original event: {(entry.message or '')[:200]}"
                )
                recent = cursor.execute(
                    """SELECT COUNT(*) FROM alerts
                       WHERE title LIKE %s
                       AND timestamp::timestamptz > NOW() - INTERVAL '5 minutes'""",
                    (f"%TI Match%{entry.hostname or entry.source}%",)
                ).fetchone()[0]
                if recent == 0:
                    cursor.execute(
                        """INSERT INTO alerts
                           (id, timestamp, title, description, severity, status, source, event_id, mitre_ref, raw_log, extracted_fields)
                           VALUES (%s, %s, %s, %s, %s, 'new', %s, %s, %s, %s, %s)""",
                        (
                            str(uuid.uuid4()), entry.timestamp, ti_alert_title, ti_description,
                            ti_sev, entry.source, entry.event_id,
                            "T1071",
                            raw_log, json.dumps({"ti_hits": hit_lines})
                        )
                    )
    except Exception:
        pass

    # Evaluate Detection Use Cases
    alert_triggered = False
    alert_title = ""
    alert_sev = "medium"
    mitre_ref = None

    for uc in active_usecases:
        if uc["type"] == "match":
            if (uc.get("event_id") and uc["event_id"] == entry.event_id) or \
               (uc.get("mitre_technique") and uc["mitre_technique"] in (entry.mitre_techniques or [])):
                alert_triggered = True
                alert_title = f"[Rule: {uc['title']}] {entry.message[:50]}"
                alert_sev = uc["severity"]
                mitre_ref = uc.get("mitre_technique")
                break
        
        elif uc["type"] == "threshold":
            if uc.get("mitre_technique") and uc["mitre_technique"] in (entry.mitre_techniques or []):
                count = cursor.execute(
                    "SELECT COUNT(*) FROM logs WHERE hostname = %s AND mitre_techniques LIKE %s",
                    (entry.hostname, f'%"{uc["mitre_technique"]}"%')
                ).fetchone()[0]
                
                if uc.get("threshold_count") and count >= uc["threshold_count"]:
                    recent_alert = cursor.execute(
                        "SELECT COUNT(*) FROM alerts WHERE title LIKE %s AND timestamp::timestamptz > NOW() - INTERVAL '5 minutes'",
                        (f"%{uc['title']}%",)
                    ).fetchone()[0]
                    
                    if recent_alert == 0:
                        alert_triggered = True
                        alert_title = f"[Threshold: {uc['title']}] {count} events on {entry.hostname}"
                        alert_sev = uc["severity"]
                        mitre_ref = uc["mitre_technique"]
                        break

    # Fallback alert on critical / high raw events
    if not alert_triggered and entry.severity in ("critical", "high"):
        alert_triggered = True
        alert_title = f"[{entry.severity.upper()}] {entry.message[:80]}"
        alert_sev = entry.severity
        mitre_ref = (entry.mitre_techniques or [None])[0]

    if alert_triggered:
        alert_id = str(uuid.uuid4())
        cursor.execute(
            """INSERT INTO alerts (id, timestamp, title, description, severity, status, source, event_id, mitre_ref, raw_log, extracted_fields)
               VALUES (%s, %s, %s, %s, %s, 'new', %s, %s, %s, %s, %s)""",
            (
                alert_id, entry.timestamp, alert_title,
                f"Generated by SOC Detection Engine for {entry.hostname}. Details: {entry.message}",
                alert_sev, entry.source, entry.event_id, mitre_ref, raw_log, "{}"
            )
        )
        # SOAR: dispatch matching playbooks
        try:
            pb_rows = cursor.execute(
                "SELECT id, name, description, enabled, trigger_severity, trigger_keyword, actions FROM playbooks WHERE enabled = TRUE"
            ).fetchall()
            if pb_rows:
                alert_obj = {
                    "id": alert_id,
                    "title": alert_title,
                    "severity": alert_sev,
                    "source": entry.source,
                    "hostname": entry.hostname,
                    "username": entry.username,
                    "timestamp": entry.timestamp,
                    "description": f"Generated by SOC Detection Engine for {entry.hostname}. Details: {entry.message}",
                    "raw_log": raw_log,
                }
                for pb in pb_rows:
                    pb_dict = {
                        "id": pb[0], "name": pb[1], "description": pb[2],
                        "enabled": pb[3], "trigger_severity": pb[4],
                        "trigger_keyword": pb[5], "actions": pb[6],
                    }
                    if should_trigger(pb_dict, alert_obj):
                        try:
                            execute_playbook(pb_dict, alert_obj, conn)
                        except Exception:
                            pass
        except Exception:
            pass

    # Stream correlation in RAM
    try:
        correlation_engine.process_stream(entry.model_dump())
    except Exception:
        pass

    return log_id

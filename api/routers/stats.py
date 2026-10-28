"""
api/routers/stats.py
====================
Dashboard KPI aggregates, hourly distributions, MITRE coverage, and EPS metrics.
"""

from fastapi import APIRouter
from api.core.database import get_db

router = APIRouter(tags=["Dashboard Stats"])

@router.get("/api/stats")
def get_stats():
    """Returns aggregated metrics for the overview dashboard."""
    with get_db() as conn:
        cursor = conn.cursor()
        total_logs = cursor.execute("SELECT COUNT(*) FROM logs").fetchone()[0]
        total_alerts = cursor.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
        critical_alerts = cursor.execute("SELECT COUNT(*) FROM alerts WHERE severity = 'critical'").fetchone()[0]
        new_alerts = cursor.execute("SELECT COUNT(*) FROM alerts WHERE status = 'new'").fetchone()[0]

        severity_rows = cursor.execute(
            "SELECT severity, COUNT(*) as count FROM logs GROUP BY severity ORDER BY count DESC"
        ).fetchall()

        top_events = cursor.execute(
            "SELECT event_id, COUNT(*) as count FROM logs WHERE event_id IS NOT NULL GROUP BY event_id ORDER BY count DESC LIMIT 10"
        ).fetchall()

        logs_by_hour = cursor.execute("""
            SELECT to_char(date_trunc('hour', timestamp), 'HH24:00') as hour, COUNT(*) as count
            FROM logs
            WHERE timestamp >= NOW() - INTERVAL '24 hours'
            GROUP BY date_trunc('hour', timestamp)
            ORDER BY date_trunc('hour', timestamp)
        """).fetchall()

        active_sources = cursor.execute("SELECT COUNT(DISTINCT hostname) FROM logs").fetchone()[0]
        total_techniques = cursor.execute("SELECT COUNT(DISTINCT technique_id) FROM mitre_mappings").fetchone()[0]
        
        detected_techniques_list = cursor.execute("""
            SELECT mt.technique_id, MAX(mt.severity) as max_severity, COUNT(*) as hit_count
            FROM mitre_mappings mt 
            INNER JOIN logs l ON l.event_id = mt.event_id
            GROUP BY mt.technique_id
        """).fetchall()
        detected_techniques = len(detected_techniques_list)

        top_sources_rows = cursor.execute(
            "SELECT source, COUNT(*) as count FROM logs GROUP BY source ORDER BY count DESC LIMIT 8"
        ).fetchall()

        severity_timeline = cursor.execute("""
            SELECT to_char(date_trunc('hour', timestamp), 'HH24:00') as hour,
                   severity,
                   COUNT(*) as count
            FROM logs
            WHERE timestamp >= NOW() - INTERVAL '24 hours'
            GROUP BY date_trunc('hour', timestamp), severity
            ORDER BY date_trunc('hour', timestamp)
        """).fetchall()

        eps_row = cursor.execute(
            "SELECT COUNT(*) FROM logs WHERE timestamp >= NOW() - INTERVAL '60 seconds'"
        ).fetchone()

    coverage = round((detected_techniques / total_techniques * 100), 1) if total_techniques > 0 else 0
    eps = round(eps_row[0] / 60, 2) if eps_row else 0

    return {
        "total_logs": total_logs,
        "total_alerts": total_alerts,
        "critical_alerts": critical_alerts,
        "new_alerts": new_alerts,
        "active_sources": active_sources,
        "mitre_coverage": coverage,
        "eps": eps,
        "severity_distribution": [{"severity": r["severity"], "count": r["count"]} for r in severity_rows],
        "top_event_ids": [{"event_id": r["event_id"], "count": r["count"]} for r in top_events],
        "logs_by_hour": [{"hour": r["hour"], "count": r["count"]} for r in logs_by_hour],
        "top_sources": [{"source": r["source"] or "Unknown", "count": r["count"]} for r in top_sources_rows],
        "severity_timeline": [{"hour": r["hour"], "severity": r["severity"], "count": r["count"]} for r in severity_timeline],
        "detected_techniques": [{"technique_id": r["technique_id"], "severity": r["max_severity"], "count": r["hit_count"]} for r in detected_techniques_list],
    }

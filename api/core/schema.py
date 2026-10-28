"""
api/core/schema.py
==================
Database table creation DDL, index verification, and initial seeding.
"""

import uuid
import psycopg
from api.core.config import settings
from api.core.database import PgConnWrapper
from api.core.seed import (
    seed_default_users, seed_use_cases, seed_parsers,
    seed_mitre_mappings, seed_sample_data
)

def init_db():
    """
    Idempotent database initialization.
    Executes DDL statements individually, seeds baseline lookup records,
    and concurrently ensures performance indexes exist.
    """
    raw = psycopg.connect(
        host=settings.DB_HOST, port=settings.DB_PORT,
        user=settings.DB_USER, password=settings.DB_PASSWORD,
        dbname=settings.DB_NAME
    )
    conn = PgConnWrapper(raw)
    cursor = conn.cursor()

    _DDL = [
        """CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL, role TEXT NOT NULL,
            real_name TEXT DEFAULT '', status TEXT DEFAULT 'Active', mfa_secret TEXT)""",
        """CREATE TABLE IF NOT EXISTS logs (
            id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, source TEXT NOT NULL,
            event_id TEXT, severity TEXT NOT NULL DEFAULT 'info',
            message TEXT NOT NULL, hostname TEXT NOT NULL, username TEXT,
            raw_log TEXT, extracted_fields TEXT,
            source_ip TEXT, destination_ip TEXT, log_type TEXT,
            mitre_tactics TEXT DEFAULT '[]', mitre_techniques TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (CURRENT_TIMESTAMP))""",
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)",
        """CREATE TABLE IF NOT EXISTS alerts (
            id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, title TEXT NOT NULL,
            description TEXT, severity TEXT NOT NULL DEFAULT 'medium',
            status TEXT NOT NULL DEFAULT 'new', source TEXT, event_id TEXT,
            mitre_ref TEXT, assigned_to TEXT, resolution_type TEXT, notes TEXT,
            raw_log TEXT, extracted_fields TEXT,
            created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT DEFAULT (CURRENT_TIMESTAMP))""",
        """CREATE TABLE IF NOT EXISTS parsers (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, regex TEXT NOT NULL,
            description TEXT, log_source TEXT, active BOOLEAN DEFAULT true)""",
        """CREATE TABLE IF NOT EXISTS use_cases (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
            type TEXT NOT NULL, event_id TEXT, mitre_technique TEXT,
            threshold_count INTEGER, rule_logic TEXT,
            severity TEXT NOT NULL, active BOOLEAN DEFAULT true)""",
        """CREATE TABLE IF NOT EXISTS mitre_mappings (
            id SERIAL PRIMARY KEY, event_id TEXT NOT NULL, title TEXT NOT NULL,
            description TEXT, tactic TEXT NOT NULL, tactic_id TEXT NOT NULL,
            technique TEXT NOT NULL, technique_id TEXT NOT NULL,
            severity TEXT NOT NULL DEFAULT 'medium', platform TEXT NOT NULL DEFAULT 'windows')""",
        """CREATE TABLE IF NOT EXISTS api_sources (
            id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL,
            config TEXT NOT NULL, status TEXT DEFAULT 'Configured',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""",
        """CREATE TABLE IF NOT EXISTS endpoint_agents (
            hostname TEXT PRIMARY KEY, ip_address TEXT, os_version TEXT,
            protocol TEXT, agent_version TEXT, link_speed TEXT,
            eps INTEGER DEFAULT 0, last_seen TIMESTAMP,
            status TEXT DEFAULT 'Active', criticality TEXT DEFAULT 'medium')""",
        """CREATE TABLE IF NOT EXISTS alert_comments (
            id TEXT PRIMARY KEY, alert_id TEXT NOT NULL,
            "user" TEXT NOT NULL, comment TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""",
        """CREATE TABLE IF NOT EXISTS reference_sets (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
            description TEXT, ttl_days INTEGER DEFAULT 0)""",
        """CREATE TABLE IF NOT EXISTS reference_set_items (
            id TEXT PRIMARY KEY, set_id TEXT NOT NULL, value TEXT NOT NULL,
            added_by TEXT, added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (set_id) REFERENCES reference_sets(id) ON DELETE CASCADE)""",
        """CREATE TABLE IF NOT EXISTS threat_feeds (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL,
            type TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL,
            last_updated TEXT, indicator_count INTEGER DEFAULT 0,
            schedule TEXT DEFAULT 'Daily at 00:00 AM')""",
        """CREATE TABLE IF NOT EXISTS threat_indicators (
            id TEXT PRIMARY KEY, feed_id TEXT NOT NULL, type TEXT NOT NULL,
            indicator TEXT NOT NULL, description TEXT,
            FOREIGN KEY(feed_id) REFERENCES threat_feeds(id) ON DELETE CASCADE)""",
        """CREATE TABLE IF NOT EXISTS playbooks (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
            enabled BOOLEAN DEFAULT TRUE, trigger_severity TEXT NOT NULL DEFAULT 'critical',
            trigger_keyword TEXT, actions TEXT NOT NULL DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""",
        """CREATE TABLE IF NOT EXISTS playbook_executions (
            id TEXT PRIMARY KEY,
            playbook_id TEXT NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
            alert_id TEXT, triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT NOT NULL DEFAULT 'running',
            results TEXT DEFAULT '[]', error TEXT)""",
        "CREATE INDEX IF NOT EXISTS idx_mitre_event_id ON mitre_mappings(event_id)",
        "ALTER TABLE logs    ADD COLUMN IF NOT EXISTS log_type TEXT",
        "ALTER TABLE endpoint_agents ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP",
        "ALTER TABLE endpoint_agents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active'",
        "ALTER TABLE endpoint_agents ADD COLUMN IF NOT EXISTS criticality TEXT DEFAULT 'medium'",
        "ALTER TABLE alerts  ADD COLUMN IF NOT EXISTS resolution_type TEXT",
        "ALTER TABLE alerts  ADD COLUMN IF NOT EXISTS notes TEXT",
        "ALTER TABLE alerts  ADD COLUMN IF NOT EXISTS raw_log TEXT",
        "ALTER TABLE alerts  ADD COLUMN IF NOT EXISTS extracted_fields TEXT",
        "ALTER TABLE parsers ADD COLUMN IF NOT EXISTS log_source TEXT",
    ]

    for stmt in _DDL:
        try:
            cursor.execute(stmt)
            conn.commit()
        except Exception:
            conn.rollback()

    # Seed baseline threat feed if missing
    cursor.execute("SELECT count(*) FROM threat_feeds")
    if cursor.fetchone()[0] == 0:
        cursor.execute(
            "INSERT INTO threat_feeds (id, name, url, type, category, status, last_updated, indicator_count) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (uuid.uuid4().hex, "AlienVault OTX",
             "https://otx.alienvault.com/otxapi/pulses/subscribe/",
             "API", "Mixed", "Active", None, 0)
        )
    conn.commit()

    # Seed lookups & initial users
    seed_mitre_mappings(cursor)
    seed_parsers(cursor)
    seed_default_users(cursor)
    seed_use_cases(cursor)
    seed_sample_data(cursor)
    conn.commit()

    # Create missing indexes concurrently to prevent table locks
    try:
        cursor.execute("SELECT indexname FROM pg_indexes WHERE tablename IN ('logs','alerts','endpoint_agents','threat_indicators')")
        existing_indexes = {r['indexname'] for r in cursor.fetchall()}
    except Exception:
        existing_indexes = set()

    _INDEXES = [
        ("idx_logs_timestamp",  "CREATE INDEX IF NOT EXISTS idx_logs_timestamp  ON logs (timestamp DESC)"),
        ("idx_logs_severity",   "CREATE INDEX IF NOT EXISTS idx_logs_severity   ON logs (severity)"),
        ("idx_logs_source",     "CREATE INDEX IF NOT EXISTS idx_logs_source     ON logs (source)"),
        ("idx_logs_hostname",   "CREATE INDEX IF NOT EXISTS idx_logs_hostname   ON logs (hostname)"),
        ("idx_logs_event_id",   "CREATE INDEX IF NOT EXISTS idx_logs_event_id   ON logs (event_id)"),
        ("idx_logs_source_ip",  "CREATE INDEX IF NOT EXISTS idx_logs_source_ip  ON logs (source_ip)"),
        ("idx_logs_log_type",   "CREATE INDEX IF NOT EXISTS idx_logs_log_type   ON logs (log_type)"),
        ("idx_logs_ts_sev",     "CREATE INDEX IF NOT EXISTS idx_logs_ts_sev     ON logs (timestamp DESC, severity)"),
        ("idx_alerts_ts",       "CREATE INDEX IF NOT EXISTS idx_alerts_ts       ON alerts (timestamp DESC)"),
        ("idx_alerts_severity", "CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts (severity)"),
        ("idx_alerts_status",   "CREATE INDEX IF NOT EXISTS idx_alerts_status   ON alerts (status)"),
        ("idx_agents_seen",     "CREATE INDEX IF NOT EXISTS idx_agents_seen     ON endpoint_agents (last_seen DESC)"),
        ("idx_ti_value",        "CREATE INDEX IF NOT EXISTS idx_ti_value        ON threat_indicators (indicator)"),
        ("idx_ti_type",         "CREATE INDEX IF NOT EXISTS idx_ti_type         ON threat_indicators (type)"),
    ]
    missing = [sql for name, sql in _INDEXES if name not in existing_indexes]
    if missing:
        try:
            idx_conn = psycopg.connect(
                host=settings.DB_HOST, port=settings.DB_PORT,
                user=settings.DB_USER, password=settings.DB_PASSWORD,
                dbname=settings.DB_NAME
            )
            idx_conn.autocommit = True
            idx_cur = idx_conn.cursor()
            for sql in missing:
                concurrent_sql = sql.replace("CREATE INDEX IF NOT EXISTS", "CREATE INDEX CONCURRENTLY IF NOT EXISTS")
                try:
                    idx_cur.execute(concurrent_sql)
                except Exception:
                    pass
            idx_conn.close()
        except Exception:
            pass

    conn.close()

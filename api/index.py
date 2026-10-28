"""
SOC Dashboard API with PostgreSQL Database
=======================================
FastAPI backend with persistent PostgreSQL storage for logs, alerts, and MITRE ATT&CK mappings.
Designed for local uvicorn usage.
"""

from fastapi import FastAPI, HTTPException, Query, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime
import uuid
import json
import re
import os
from dotenv import load_dotenv
load_dotenv()
import requests
import pyotp

# ── Roadmap integrations ──────────────────────────────────────────────────────
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from streaming import router as streaming_router
from correlation import engine as correlation_engine, start_batch_scheduler
from playbook_engine import execute_playbook, should_trigger


# ---------------------------------------------------------------------------
# Database setup
# ---------------------------------------------------------------------------

# Use /tmp for Vercel serverless (ephemeral), or local path for persistent storage


import os
from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

load_dotenv()

DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = os.environ.get("DB_PORT", "5432")
DB_USER = os.environ.get("DB_USER", "postgres")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "Singhnk.001k")
DB_NAME = os.environ.get("DB_NAME", "SOC_DB")

# ---------------------------------------------------------------------------
# Connection pool — max 10 connections, keeps min 2 warm.
# Eliminates the CLOSE_WAIT storm caused by per-request psycopg.connect().
# ---------------------------------------------------------------------------
_DB_CONNINFO = (
    f"host={DB_HOST} port={DB_PORT} user={DB_USER} "
    f"password={DB_PASSWORD} dbname={DB_NAME}"
)
_pool: "ConnectionPool | None" = None

def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None or _pool.closed:
        # open=False: do NOT spawn background threads at import time.
        # pool.open() is called explicitly in the FastAPI startup event
        # so threads are created inside uvicorn's already-running loop.
        _pool = ConnectionPool(
            conninfo=_DB_CONNINFO,
            kwargs={"row_factory": dict_row},
            min_size=5,
            max_size=20,
            max_waiting=100,
            reconnect_timeout=30,
            open=False,
        )
        _pool.open(wait=True, timeout=30)
    return _pool

class DictRow(dict):
    """PostgreSQL row returned as a dict that also supports integer index access."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._values = list(self.values())
    def __getitem__(self, item):
        if isinstance(item, int):
            return self._values[item]
        return super().__getitem__(item)

def dict_row_factory(cursor):
    dict_maker = dict_row(cursor)
    def make_row(values):
        d = dict_maker(values)
        return DictRow(d)
    return make_row

class PgCursorWrapper:
    def __init__(self, cur):
        self.cur = cur

    def execute(self, query, params=None):
        if params is not None:
            self.cur.execute(query, params)
        else:
            self.cur.execute(query)
        return self

    def executemany(self, query, params_list):
        self.cur.executemany(query, params_list)
        return self
        
    def executescript(self, script):
        self.cur.execute(script)
        return self

    def fetchone(self):
        return self.cur.fetchone()

    def fetchall(self):
        return self.cur.fetchall()
        
    def close(self):
        self.cur.close()
        
    @property
    def rowcount(self):
        return self.cur.rowcount

class PgConnWrapper:
    def __init__(self, conn, pool=None):
        self.conn = conn
        self._pool = pool  # if set, return to pool on close

    def execute(self, query, params=None):
        cur = self.conn.cursor()
        if params is not None:
            cur.execute(query, params)
        else:
            cur.execute(query)
        return PgCursorWrapper(cur)
        
    def executemany(self, query, params_list):
        cur = self.conn.cursor()
        cur.executemany(query, params_list)
        return PgCursorWrapper(cur)

    def cursor(self):
        return PgCursorWrapper(self.conn.cursor())

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        if getattr(self, '_returned', False):
            return  # already returned to pool, don't double-return
        self._returned = True
        try:
            if self._pool is not None:
                self._pool.putconn(self.conn)
            else:
                self.conn.close()
        except Exception:
            try:
                self.conn.close()
            except Exception:
                pass

    def __del__(self):
        """Safety net: return connection to pool if caller forgot to call close()."""
        if not getattr(self, '_returned', False):
            self.close()

    def __enter__(self):
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            try:
                self.commit()
            except Exception:
                self.rollback()
        else:
            try:
                self.rollback()
            except Exception:
                pass
        self.close()

def get_db():
    """Borrow a connection from the pool. Use as a context manager for auto-return."""
    try:
        pool = _get_pool()
        raw = pool.getconn(timeout=10.0)
        raw.row_factory = dict_row_factory
        # Verify the connection is alive; discard and reconnect if not
        try:
            raw.execute("SELECT 1")
        except Exception:
            try:
                pool.putconn(raw)
            except Exception:
                pass
            raw = psycopg.connect(
                host=DB_HOST, port=DB_PORT, user=DB_USER,
                password=DB_PASSWORD, dbname=DB_NAME,
                row_factory=dict_row_factory
            )
            return PgConnWrapper(raw)
        return PgConnWrapper(raw, pool=pool)
    except Exception:
        # Fallback: direct connection (e.g. during init_db before pool is open)
        raw = psycopg.connect(
            host=DB_HOST, port=DB_PORT, user=DB_USER,
            password=DB_PASSWORD, dbname=DB_NAME,
            row_factory=dict_row_factory
        )
        return PgConnWrapper(raw)

def init_db():
    """Initialize database tables if they don't exist.
    Uses a direct psycopg connection (NOT the pool) so it never competes
    with request-serving pool connections during startup."""
    raw = psycopg.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER,
        password=DB_PASSWORD, dbname=DB_NAME
    )
    conn = PgConnWrapper(raw)
    cursor = conn.cursor()

    # psycopg3 does NOT support executescript() — run each DDL statement individually.
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
        # Idempotent column additions (ADD COLUMN IF NOT EXISTS — PostgreSQL 9.6+)
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
    for _stmt in _DDL:
        try:
            cursor.execute(_stmt)
            conn.commit()
        except Exception as _e:
            conn.rollback()
            print(f"[init_db] DDL note: {_e}")

    # Seed AlienVault feed record if the table is empty
    cursor.execute("SELECT count(*) FROM threat_feeds")
    if cursor.fetchone()[0] == 0:
        import uuid as _uuid2
        cursor.execute(
            "INSERT INTO threat_feeds (id, name, url, type, category, status, last_updated, indicator_count) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (_uuid2.uuid4().hex, "AlienVault OTX",
             "https://otx.alienvault.com/otxapi/pulses/subscribe/",
             "API", "Mixed", "Active", None, 0)
        )
    conn.commit()

    # Seed MITRE mappings if table is empty
    count = cursor.execute("SELECT COUNT(*) FROM mitre_mappings").fetchone()[0]
    if count == 0:
        _seed_mitre_mappings(cursor)

    # Seed Use Cases if table is empty
    count_p = cursor.execute("SELECT COUNT(*) FROM parsers").fetchone()[0]
    if count_p == 0:
        _seed_parsers(cursor)

    # Seed default users
    count_u = cursor.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if count_u == 0:
        cursor.execute("INSERT INTO users (id, username, password, role, real_name, status) VALUES (%s, %s, %s, %s, %s, %s)", (str(uuid.uuid4()), 'admin', 'Singhnk.001k', 'admin', 'Administrator', 'Active'))
        cursor.execute("INSERT INTO users (id, username, password, role, real_name, status) VALUES (%s, %s, %s, %s, %s, %s)", (str(uuid.uuid4()), 'readonly', 'readonly@123', 'readonly', 'Read Only User', 'Active'))

    count_uc = cursor.execute("SELECT COUNT(*) FROM use_cases").fetchone()[0]
    if count_uc == 0:
        _seed_use_cases(cursor)

    # Only seed sample data when the DB is truly empty (< 10 real logs)
    _cnt = cursor.execute("SELECT COUNT(*) FROM logs").fetchone()[0]
    if _cnt < 10:
        _seed_sample_data(cursor)

    # ── Indexes (idempotent — CREATE INDEX IF NOT EXISTS) ───────────────────
    # Check which indexes already exist to avoid blocking CREATE INDEX on live table
    try:
        cursor.execute("""
            SELECT indexname FROM pg_indexes WHERE tablename IN ('logs','alerts','endpoint_agents','threat_indicators')
        """)
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
        # Create missing indexes using CONCURRENTLY (non-blocking, no table lock).
        # CONCURRENTLY requires autocommit — use a separate direct connection.
        try:
            _idx_conn = psycopg.connect(
                host=DB_HOST, port=DB_PORT, user=DB_USER,
                password=DB_PASSWORD, dbname=DB_NAME
            )
            _idx_conn.autocommit = True
            _idx_cur = _idx_conn.cursor()
            for sql in missing:
                concurrent_sql = sql.replace("CREATE INDEX IF NOT EXISTS", "CREATE INDEX CONCURRENTLY IF NOT EXISTS")
                try:
                    _idx_cur.execute(concurrent_sql)
                    print(f"[init_db] Created index: {concurrent_sql[:60]}")
                except Exception as e:
                    print(f"[init_db] Index skip ({e}): {sql[:60]}")
            _idx_conn.close()
        except Exception as e:
            print(f"[init_db] Index creation error: {e}")
    else:
        print("[init_db] All indexes already exist — skipping.")
    conn.commit()
    conn.close()

def _seed_sample_data(cursor):
    """Seed comprehensive 100+ sample logs and alerts for Vercel deployment visualization."""
    import uuid
    import random
    import json
    from datetime import datetime, timedelta
    
    count = cursor.execute("SELECT COUNT(*) FROM logs").fetchone()[0]
    if count > 0:
        return
        
    now = datetime.utcnow()
    logs_data = []
    
    users = ["admin", "root", "jsmith", "sysadmin", "postgres", "db_service", "Guest"]
    ips = ["192.168.1.50", "192.168.1.100", "172.16.0.5", "198.51.100.42", "10.0.50.100", "8.8.8.8"]
    
    # 1. FortiGate IPS Logs (Medium/High)
    for i in range(30):
        t = now - timedelta(hours=random.randint(0, 48), minutes=random.randint(0, 60))
        src_ip = random.choice(ips)
        dst_ip = random.choice(ips)
        raw = f'<185>date={t.strftime("%Y-%m-%d")} time={t.strftime("%H:%M:%S")} devname="FW-CORE-01" devid="FGVMX00000000000" eventtime={int(t.timestamp()*1000000000)} tz="+0530" logid="0419016384" type="utm" subtype="ips" eventtype="signature" level="alert" vd="root" severity="medium" srcip={src_ip} srccountry="India" dstip={dst_ip} dstcountry="Reserved" srcintf="port2" srcintfrole="undefined" dstintf="DMZ-WEB" dstintfrole="lan" sessionid=1616798053 action="detected" proto=6 service="HTTP" policyid=158 poluuid="6b6363ca-abd0-51ee-6948-804c9eb73216" policytype="policy" attack="MS.IIS.WebDAV.Authentication.Bypass" srcport={random.randint(1024, 65535)} dstport=443 hostname="uat.example.com" url="/" agent="Mozilla/5.0 (compatible; Nmap Scripting Engine; https://nmap.org/book/nse.html)" httpmethod="PROPFIND" direction="outgoing" attackid=99999 profile="Corporate_IPS_Policy" ref=http://www.fortinet.com/ids/VID99999 incidentserialno=123456789 msg="web_server: MS.IIS.WebDAV.Authentication.Bypass" crscore=10 craction=16384 crlevel="medium"'
        extracted = json.dumps({"srcip": src_ip, "dstip": dst_ip, "attack": "MS.IIS.WebDAV.Authentication.Bypass", "action": "detected", "agent": "Nmap Scripting Engine"})
        logs_data.append((str(uuid.uuid4()), t.isoformat() + "Z", "FortiGate Firewall", "99999", "medium", "web_server: MS.IIS.WebDAV.Authentication.Bypass", "FW-CORE-01", None, raw, extracted))

    # 2. FortiWeb WAF Critical Event
    for i in range(15):
        t = now - timedelta(hours=random.randint(0, 48), minutes=random.randint(0, 60))
        raw = f'<2>date={t.strftime("%Y-%m-%d")} time={t.strftime("%H:%M:%S")} devname=WAF-EDGE-01 device_id=FADVMX0000000000 log_id=0003000200 type=event subtype=system pri=critical vd=root msg_id=1646440413 submod="none" user="none" ui="none" action="none" status="success" logdesc="Certification" msg="Local certificate test23 is expired !!"'
        extracted = json.dumps({"status": "success", "logdesc": "Certification", "msg": "Local certificate test23 is expired !!"})
        logs_data.append((str(uuid.uuid4()), t.isoformat() + "Z", "FortiWeb WAF", "0003000200", "critical", "Local certificate test23 is expired !!", "WAF-EDGE-01", "none", raw, extracted))

    # 3. Windows Security Auditing (Event 4769, 4625, 4688)
    for i in range(40):
        t = now - timedelta(hours=random.randint(0, 48), minutes=random.randint(0, 60))
        user = random.choice(users)
        src_ip = random.choice(ips)
        raw = f'2026-05-13T20:57:29Z ad-server-02 192.168.1.100 FSM-WUA-WinLog-Security [phCustId]="0000" [customer]="ACME" [monitorStatus]="Success" [Locale]="en-US" [MachineGuid]="00000000-0000-0000-0000-000000000000" [timeZone]="+0530" [extEventRecvProto]="Windows Agent" [level]="Information" [xml]=<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event"><System><Provider Name="Microsoft-Windows-Security-Auditing" Guid="{{54849625-5478-4994-a5ba-3e3b0328c30d}}"/><EventID>4769</EventID><Version>2</Version><Level>0</Level><Task>14337</Task><Opcode>0</Opcode><Keywords>0x8020000000000000</Keywords><TimeCreated SystemTime="{t.isoformat()}Z"/><EventRecordID>14531113</EventRecordID><Correlation/><Execution ProcessID="856" ThreadID="6540"/><Channel>Security</Channel><Computer>dc-01.corp.com</Computer><Security/></System><EventData><Data Name="TargetUserName">{user}</Data><Data Name="TargetDomainName">CORP.LOCAL</Data><Data Name="ServiceName">sql_admin</Data><Data Name="IpAddress">::ffff:{src_ip}</Data></EventData></Event>'
        extracted = json.dumps({"TargetUserName": user, "IpAddress": src_ip, "EventID": "4769", "ServiceName": "sql_admin"})
        logs_data.append((str(uuid.uuid4()), t.isoformat() + "Z", "Windows Server", "4769", "info", f"Kerberos service ticket requested for {user}", "dc-01", user, raw, extracted))

    # 4. Linux Syslog Auth Failures
    for i in range(25):
        t = now - timedelta(hours=random.randint(0, 48), minutes=random.randint(0, 60))
        user = random.choice(users)
        src_ip = random.choice(ips)
        raw = f"{t.strftime('%b %d %H:%M:%S')} ubuntu-web01 sshd[14233]: Failed password for invalid user {user} from {src_ip} port {random.randint(1024, 65535)} ssh2"
        extracted = json.dumps({"user": user, "src_ip": src_ip, "port": str(random.randint(1024, 65535)), "process": "sshd"})
        logs_data.append((str(uuid.uuid4()), t.isoformat() + "Z", "Linux Auth", "syslog", "low", f"Failed password for invalid user {user}", "ubuntu-web01", user, raw, extracted))

    # 5. Fortinet ADC Traffic Logs (Information)
    for i in range(20):
        t = now - timedelta(hours=random.randint(0, 48), minutes=random.randint(0, 60))
        duration = random.randint(5, 120)
        ibytes = random.randint(100, 5000)
        obytes = random.randint(100, 5000)
        src_port = random.randint(1024, 65535)
        raw = f'<6>date={t.strftime("%Y-%m-%d")} time={t.strftime("%H:%M:%S")},devname=ADC-EDGE-01,device_id=FADVX000000000,log_id=0100008000,type=traffic,subtype=slb_layer4,pri=information,vd=root,msg_id=11732454543,duration={duration},ibytes={ibytes},obytes={obytes},proto=6,service="tcp",src="fc00:0:1::2",src_port={src_port},dst="fd00:0:2::5306",dst_port=4060,trans_src="fc00:0:1::2",trans_src_port={src_port},trans_dst="fd00:0:2::5302",trans_dst_port=4060,policy="WEB_VIP_4060",action="none",srccountry="Reserved",dstcountry="Reserved",real_server="WEB_NODE_{random.randint(1,5)}"'
        extracted = json.dumps({"src": "fc00:0:1::2", "dst": "fd00:0:2::5306", "service": "tcp", "policy": "WEB_VIP_4060", "duration": duration, "ibytes": ibytes})
        logs_data.append((str(uuid.uuid4()), t.isoformat() + "Z", "Fortinet ADC", "0100008000", "info", f"SLB Layer4 Traffic routed to WEB_NODE_{random.randint(1,5)}", "ADC-EDGE-01", None, raw, extracted))

    # 6. CrowdStrike Falcon EDR Logs (CEF Format - High/Critical)
    for i in range(15):
        t = now - timedelta(hours=random.randint(0, 48), minutes=random.randint(0, 60))
        user = random.choice(users)
        host = f"WORKSTATION-{random.randint(10, 99)}"
        detect = random.choice(["Ransomware_indicator", "CredentialDumping_lsass", "SuspiciousPowerShell"])
        raw = f'CEF:0|CrowdStrike|FalconHost|1.0|DetectionSummaryEvent|High Severity Detection|8|rt={int(t.timestamp()*1000)} src=192.168.1.{random.randint(100,200)} shost={host} duser={user} cs1Label=SensorId cs1=ab1234 cs2Label=DetectName cs2={detect} cs3Label=FileName cs3=malware.exe cs4Label=FilePath cs4=C:\\Users\\{user}\\Downloads\\ cs5Label=CommandLine cs5="malware.exe -bypass" act=blocked msg=A critical behavior was detected and blocked by Falcon sensor.'
        extracted = json.dumps({"shost": host, "duser": user, "DetectName": detect, "FileName": "malware.exe", "act": "blocked"})
        logs_data.append((str(uuid.uuid4()), t.isoformat() + "Z", "CrowdStrike Falcon", "DetectionSummaryEvent", "high", f"CrowdStrike blocked {detect} on {host}", host, user, raw, extracted))

    # 7. Symantec DLP Logs (CEF Format - High)
    for i in range(15):
        t = now - timedelta(hours=random.randint(0, 48), minutes=random.randint(0, 60))
        user = random.choice(users)
        host = f"WORKSTATION-{random.randint(10, 99)}"
        raw = f'CEF:0|Symantec|DataLossPrevention|15.8|Incident|High Severity Incident|8|rt={int(t.timestamp()*1000)} src=192.168.1.{random.randint(100,200)} shost={host} duser={user} cs1Label=Policy cs1=PCI_DSS_Credit_Card cs2Label=Action cs2=Blocked cs3Label=FileName cs3=customer_data.csv cs4Label=Severity cs4=High msg=User attempted to upload credit card data to unauthorized cloud storage.'
        extracted = json.dumps({"shost": host, "duser": user, "Policy": "PCI_DSS_Credit_Card", "FileName": "customer_data.csv", "Action": "Blocked"})
        logs_data.append((str(uuid.uuid4()), t.isoformat() + "Z", "Symantec DLP", "Incident", "high", f"DLP Blocked PCI DSS Data Exfiltration by {user}", host, user, raw, extracted))

    # Sort logs chronologically to be realistic
    logs_data.sort(key=lambda x: x[1])

    cursor.executemany("""
        INSERT INTO logs (id, timestamp, source, event_id, severity, message, hostname, username, raw_log, extracted_fields)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, logs_data)
    
    # Sample Alerts covering all severities
    alerts_data = [
        (str(uuid.uuid4()), (now - timedelta(minutes=5)).isoformat() + "Z", "Certificate Expiration Warning", "Local certificate test23 is expired on WAF!! This may cause HTTPS traffic failures.", "critical", "new", "FortiWeb WAF", "0003000200", "T1587.004", logs_data[-1][8], logs_data[-1][9], None),
        (str(uuid.uuid4()), (now - timedelta(minutes=25)).isoformat() + "Z", "WebDAV Authentication Bypass Attempt", "Nmap Scripting Engine detected attempting MS.IIS.WebDAV.Authentication.Bypass vulnerability.", "high", "investigating", "FortiGate Firewall", "99999", "T1190", logs_data[-2][8], logs_data[-2][9], "admin"),
        (str(uuid.uuid4()), (now - timedelta(hours=2)).isoformat() + "Z", "Multiple SSH Login Failures", "Detected multiple failed password attempts for invalid users from 198.51.100.42.", "medium", "new", "Linux Auth", "syslog", "T1110", logs_data[10][8], logs_data[10][9], None),
        (str(uuid.uuid4()), (now - timedelta(hours=5)).isoformat() + "Z", "Kerberos Service Ticket Requested Anomaly", "Unusual volume of Kerberos ticket requests for sql_admin service.", "low", "resolved", "Windows Server", "4769", "T1558.003", logs_data[5][8], logs_data[5][9], "admin"),
        (str(uuid.uuid4()), (now - timedelta(hours=1)).isoformat() + "Z", "ADC Traffic Anomaly", "Unusually high connection duration detected on SLB Layer4 traffic across IPv6 nodes.", "medium", "investigating", "Fortinet ADC", "0100008000", "T1071.001", logs_data[-1][8], logs_data[-1][9], "readonly"),
        (str(uuid.uuid4()), (now - timedelta(minutes=45)).isoformat() + "Z", "CrowdStrike: Credential Dumping Detected", "Falcon sensor blocked lsass.exe memory dumping attempt.", "critical", "new", "CrowdStrike Falcon", "DetectionSummaryEvent", "T1003.001", logs_data[-16][8], logs_data[-16][9], None),
        (str(uuid.uuid4()), (now - timedelta(hours=3)).isoformat() + "Z", "DLP: PCI Data Exfiltration Blocked", "Symantec DLP blocked an attempt to upload customer_data.csv containing credit card numbers.", "high", "new", "Symantec DLP", "Incident", "T1048.003", logs_data[-2][8], logs_data[-2][9], "admin")
    ]
    cursor.executemany("""
        INSERT INTO alerts (id, timestamp, title, description, severity, status, source, event_id, mitre_ref, raw_log, extracted_fields, assigned_to)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, alerts_data)

    # Use Cases supporting these alerts
    uc_data = [
        (f"UC-{str(uuid.uuid4())[:8].upper()}", "FortiWeb: Expired Certificate", "Detects local certificate expiration events on FortiWeb WAF to prevent service disruption.", "match", "0003000200", "T1587.004", None, "critical", 1, '{"field": "msg", "operator": "contains", "value": "expired"}'),
        (f"UC-{str(uuid.uuid4())[:8].upper()}", "FortiGate: Nmap WebDAV Scan", "Detects automated Nmap WebDAV authentication bypass vulnerability scanning attempts.", "match", "99999", "T1190", None, "high", 1, '{"field": "agent", "operator": "contains", "value": "Nmap"}'),
        (f"UC-{str(uuid.uuid4())[:8].upper()}", "Windows: Kerberos Ticket Anomalies", "Detects abnormal volume of Kerberos TGS requests (Event 4769).", "threshold", "4769", "T1558.003", 50, "low", 1, None),
        (f"UC-{str(uuid.uuid4())[:8].upper()}", "Fortinet ADC: Traffic Anomaly", "Detects unusual Layer 4 load balancing traffic durations on IPv6 networks.", "threshold", "0100008000", "T1071.001", 100, "medium", 1, '{"field": "duration", "operator": ">", "value": "100"}'),
        (f"UC-{str(uuid.uuid4())[:8].upper()}", "CrowdStrike: Credential Dumping", "Triggers when Falcon sensor detects LSASS memory dumping.", "match", "DetectionSummaryEvent", "T1003.001", None, "critical", 1, '{"field": "DetectName", "operator": "contains", "value": "lsass"}'),
        (f"UC-{str(uuid.uuid4())[:8].upper()}", "DLP: PCI Exfiltration", "Triggers when DLP blocks PCI credit card data transfer to unauthorized locations.", "match", "Incident", "T1048.003", None, "high", 1, '{"field": "Policy", "operator": "contains", "value": "PCI"}')
    ]
    cursor.executemany("""
        INSERT INTO use_cases (id, title, description, type, event_id, mitre_technique, threshold_count, severity, active, rule_logic)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, uc_data)


def _seed_use_cases(cursor):
    """Seed comprehensive generic detection rules for Windows and Linux."""
    seed_data = [
        # Windows Rules
        ("UC-W01", "Windows: Multiple Login Failures (Brute Force)", "Detects multiple failed logins (Event 4625).", "threshold", "4625", "T1110", 3, "high", 1, None),
        ("UC-W02", "Windows: Clear Audit Logs (Defense Evasion)", "Windows audit logs cleared (Event 1102).", "match", "1102", "T1070.001", None, "critical", 1, None),
        ("UC-W03", "Windows: New Service Creation (Persistence)", "A new service was installed in the system (Event 7045/4697).", "match", "4697", "T1543.003", None, "high", 1, None),
        ("UC-W04", "Windows: Scheduled Task Created", "A scheduled task was created (Event 4698).", "match", "4698", "T1053.005", None, "medium", 1, None),
        ("UC-W05", "Windows: User Account Created", "A new user account was created (Event 4720).", "match", "4720", "T1136.001", None, "low", 1, None),
        
        # Linux Rules
        ("UC-L01", "Linux: SSH Brute Force", "Multiple failed SSH logins.", "threshold", None, "T1110", 3, "high", 1, None),
        ("UC-L02", "Linux: Privilege Escalation Attempt", "Failed sudo or authentication failure.", "threshold", None, "T1078", 2, "high", 1, None),
        ("UC-L03", "Linux: Local Account Creation", "New user added via useradd.", "match", None, "T1136", None, "medium", 1, None),
        ("UC-L04", "Linux: Firewall Tampering", "iptables/ufw rules modified or disabled.", "match", None, "T1562.004", None, "critical", 1, None),
        ("UC-L05", "Linux: Suspicious Cron Job", "Cron job added for persistence.", "match", None, "T1053.003", None, "medium", 1, None),
        ("UC-L06", "Linux: Package Execution", "Use of apt/yum (potential suspicious install).", "match", None, "T1059", None, "info", 1, None)
    ]
    cursor.executemany("""
        INSERT INTO use_cases (id, title, description, type, event_id, mitre_technique, threshold_count, severity, active, rule_logic)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, seed_data)


def _seed_parsers(cursor):
    """Seed custom log parsers."""
    parsers_data = [
        ("PARSER-01", "Cisco ASA Firewall", r"%ASA-\d+-(\d+): (.+)", "Parses Cisco ASA syslog messages", 1, "syslog"),
        ("PARSER-02", "Nginx Access Log", r"(?P<ip>\S+) \S+ \S+ \[.*?\] \"(?P<method>\S+) (?P<path>\S+) \S+\" (?P<status>\d+) .*", "Parses Nginx access logs", 1, "nginx")
    ]
    cursor.executemany("INSERT INTO parsers (id, name, regex, description, active, log_source) VALUES (%s, %s, %s, %s, %s, %s)", parsers_data)

def _seed_mitre_mappings(cursor):
    """Seed the MITRE ATT&CK mapping table with 50+ Windows Event ID mappings."""
    mappings = [
        # Initial Access (TA0001)
        ("4625", "Failed Logon", "An account failed to log on - potential brute force indicator", "Initial Access", "TA0001", "Valid Accounts", "T1078", "high", "windows"),
        ("4648", "Explicit Credential Logon", "A logon was attempted using explicit credentials", "Initial Access", "TA0001", "Valid Accounts", "T1078", "medium", "windows"),
        # Execution (TA0002)
        ("4688", "Process Creation", "A new process has been created", "Execution", "TA0002", "Command and Scripting Interpreter", "T1059", "medium", "windows"),
        ("4104", "PowerShell Script Block", "PowerShell script block logging captured a command", "Execution", "TA0002", "PowerShell", "T1059.001", "high", "windows"),
        ("1",    "Sysmon Process Create", "Sysmon logged a new process creation with full command line", "Execution", "TA0002", "Command and Scripting Interpreter", "T1059", "medium", "windows"),
        # Persistence (TA0003)
        ("4697", "Service Installed", "A service was installed in the system", "Persistence", "TA0003", "Create or Modify System Process", "T1543.003", "high", "windows"),
        ("7045", "New Service Created", "A new service was installed on the system", "Persistence", "TA0003", "Create or Modify System Process", "T1543.003", "high", "windows"),
        ("4698", "Scheduled Task Created", "A scheduled task was created", "Persistence", "TA0003", "Scheduled Task/Job", "T1053.005", "high", "windows"),
        ("13",   "Sysmon Registry Value Set", "Sysmon detected a registry value being set", "Persistence", "TA0003", "Boot or Logon Autostart Execution", "T1547.001", "medium", "windows"),
        # Privilege Escalation (TA0004)
        ("4672", "Special Privileges Assigned", "Special privileges were assigned to a new logon", "Privilege Escalation", "TA0004", "Valid Accounts", "T1078", "medium", "windows"),
        ("4673", "Privileged Service Called", "A privileged service was called", "Privilege Escalation", "TA0004", "Access Token Manipulation", "T1134", "high", "windows"),
        ("4674", "Privileged Object Operation", "An operation was attempted on a privileged object", "Privilege Escalation", "TA0004", "Access Token Manipulation", "T1134", "medium", "windows"),
        # Defense Evasion (TA0005)
        ("1102", "Audit Log Cleared", "The audit log was cleared - potential evidence tampering", "Defense Evasion", "TA0005", "Indicator Removal", "T1070.001", "critical", "windows"),
        ("4657", "Registry Value Modified", "A registry value was modified", "Defense Evasion", "TA0005", "Modify Registry", "T1112", "medium", "windows"),
        ("4719", "Audit Policy Changed", "System audit policy was changed", "Defense Evasion", "TA0005", "Impair Defenses", "T1562.002", "high", "windows"),
        # Credential Access (TA0006)
        ("4768", "Kerberos TGT Request", "A Kerberos authentication ticket (TGT) was requested", "Credential Access", "TA0006", "Steal or Forge Kerberos Tickets", "T1558", "medium", "windows"),
        ("4769", "Kerberos Service Ticket", "A Kerberos service ticket was requested", "Credential Access", "TA0006", "Steal or Forge Kerberos Tickets", "T1558.003", "medium", "windows"),
        ("4771", "Kerberos Pre-Auth Failed", "Kerberos pre-authentication failed", "Credential Access", "TA0006", "Brute Force", "T1110", "high", "windows"),
        ("4776", "Credential Validation", "The computer attempted to validate the credentials for an account", "Credential Access", "TA0006", "Brute Force", "T1110", "medium", "windows"),
        # Discovery (TA0007)
        ("4799", "Group Membership Enumeration", "A security-enabled group membership was enumerated", "Discovery", "TA0007", "Permission Groups Discovery", "T1069", "low", "windows"),
        ("4661", "Handle to Object Requested", "A handle to an object was requested for directory service access", "Discovery", "TA0007", "Account Discovery", "T1087", "low", "windows"),
        # Lateral Movement (TA0008)
        ("4624", "Successful Logon", "An account was successfully logged on (Type 3=Network, Type 10=Remote)", "Lateral Movement", "TA0008", "Remote Services", "T1021", "low", "windows"),
        ("4778", "Session Reconnected", "A session was reconnected to a Window Station", "Lateral Movement", "TA0008", "Remote Desktop Protocol", "T1021.001", "medium", "windows"),
        # Collection (TA0009)
        ("4663", "Object Access Attempt", "An attempt was made to access an object (file, registry, etc.)", "Collection", "TA0009", "Data from Local System", "T1005", "low", "windows"),
        ("4656", "Handle to Object Requested", "A handle to an object was requested", "Collection", "TA0009", "Data from Local System", "T1005", "low", "windows"),
        # Command and Control (TA0011)
        ("5156", "WFP Connection Allowed", "The Windows Filtering Platform has permitted a connection", "Command and Control", "TA0011", "Application Layer Protocol", "T1071", "low", "windows"),
        ("5157", "WFP Connection Blocked", "The Windows Filtering Platform has blocked a connection", "Command and Control", "TA0011", "Application Layer Protocol", "T1071", "medium", "windows"),
        # Exfiltration (TA0010)
        ("2004", "Firewall Rule Added", "A rule has been added to the Windows Firewall exception list", "Exfiltration", "TA0010", "Exfiltration Over Alternative Protocol", "T1048", "high", "windows"),
        # Impact (TA0040)
        ("4720", "User Account Created", "A user account was created", "Impact", "TA0040", "Account Manipulation", "T1098", "high", "windows"),
        ("4726", "User Account Deleted", "A user account was deleted", "Impact", "TA0040", "Account Access Removal", "T1531", "high", "windows"),
        # Resource Development (TA0042)
        ("4740", "Account Locked Out", "A user account was locked out", "Resource Development", "TA0042", "Compromise Accounts", "T1586", "medium", "windows"),
        # Reconnaissance (TA0043)
        ("4798", "User Group Membership Enumerated", "A user's local group membership was enumerated", "Reconnaissance", "TA0043", "Account Discovery", "T1087", "low", "windows"),
        # Linux-specific mappings
        ("AUTH_SUCCESS", "SSH Login Success", "Successful SSH authentication", "Initial Access", "TA0001", "Valid Accounts", "T1078", "low", "linux"),
        ("AUTH_FAILURE", "SSH Login Failure", "Failed SSH authentication attempt", "Initial Access", "TA0001", "Brute Force", "T1110", "high", "linux"),
        ("SUDO_USAGE", "Sudo Command Executed", "A command was run with elevated privileges via sudo", "Privilege Escalation", "TA0004", "Sudo and Sudo Caching", "T1548.003", "medium", "linux"),
        ("USER_CREATED", "User Account Created", "A new user account was created on the system", "Persistence", "TA0003", "Create Account", "T1136.001", "high", "linux"),
        ("CRON_EXEC", "Cron Job Executed", "A scheduled cron job was executed", "Execution", "TA0002", "Scheduled Task/Job: Cron", "T1053.003", "low", "linux"),
        ("SERVICE_START", "Service Started", "A system service was started", "Persistence", "TA0003", "Create or Modify System Process", "T1543.002", "low", "linux"),
        ("FIREWALL_MOD", "Firewall Rule Modified", "iptables/nftables rule was modified", "Defense Evasion", "TA0005", "Impair Defenses", "T1562.004", "high", "linux"),
        ("PKG_INSTALL", "Package Installed", "A software package was installed", "Execution", "TA0002", "Software Deployment Tools", "T1072", "medium", "linux"),
    ]

    cursor.executemany(
        "INSERT INTO mitre_mappings (event_id, title, description, tactic, tactic_id, technique, technique_id, severity, platform) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
        mappings
    )

# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------


import threading
import time
from datetime import datetime

def sync_feed_internal(feed_id: str, conn):
    import urllib.request
    import csv
    from io import StringIO
    
    cursor = conn.cursor()
    cursor.execute("SELECT url FROM threat_feeds WHERE id = %s", (feed_id,))
    row = cursor.fetchone()
    if not row: return
    
    url = row[0]

    # OTX-managed feeds use the API key, not a CSV URL
    if url.startswith("otx://"):
        pulse_id = url[6:]
        otx_key = get_setting("OTX_API_KEY")
        if not otx_key:
            print(f"OTX API key not configured — skipping scheduled sync for feed {feed_id}")
            return
        try:
            pulse = _otx_get(f"/pulses/{pulse_id}", otx_key)
            indicators = pulse.get("indicators", [])
            cursor.execute("DELETE FROM threat_indicators WHERE feed_id = %s", (feed_id,))
            count = 0
            for ind in indicators:
                t = ind.get("type", "Unknown"); v = ind.get("indicator", ""); d = ind.get("description", "")
                if v:
                    cursor.execute("INSERT INTO threat_indicators (id, feed_id, type, indicator, description) VALUES (%s, %s, %s, %s, %s)",
                                   (str(uuid.uuid4()), feed_id, t, v, d))
                    count += 1
            now = datetime.now().isoformat()
            cursor.execute("UPDATE threat_feeds SET indicator_count = %s, last_updated = %s, status = 'Active' WHERE id = %s",
                           (count, now, feed_id))
            conn.commit()
        except Exception as e:
            print(f"OTX sync failed for {feed_id}: {e}")
            try:
                conn.rollback()
                cursor.execute("UPDATE threat_feeds SET status = 'Error' WHERE id = %s", (feed_id,))
                conn.commit()
            except Exception: pass
        return

    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        response = urllib.request.urlopen(req).read().decode('utf-8')
        f = StringIO(response)
        reader = csv.DictReader(f)
        
        cursor.execute("DELETE FROM threat_indicators WHERE feed_id = %s", (feed_id,))
        count = 0
        for r in reader:
            clean_r = {k.strip().replace('"', ''): v.strip().replace('"', '') for k, v in r.items()}
            t = clean_r.get('Indicator type', 'Unknown')
            ind = clean_r.get('Indicator', '')
            desc = clean_r.get('Description', '')
            if not ind: continue
            cursor.execute("INSERT INTO threat_indicators (id, feed_id, type, indicator, description) VALUES (%s, %s, %s, %s, %s)",
                          (str(uuid.uuid4()), feed_id, t, ind, desc))
            count += 1
            
        cursor.execute(
            "UPDATE threat_feeds SET last_updated = %s, indicator_count = %s, status = 'Active' WHERE id = %s",
            (datetime.now().isoformat(), count, feed_id)
        )
        conn.commit()
    except Exception as e:
        print(f"Failed to sync {feed_id}: {e}")
        try:
            conn.rollback()
            cursor.execute(
                "UPDATE threat_feeds SET status = 'Error' WHERE id = %s", (feed_id,)
            )
            conn.commit()
        except Exception as e2:
            print(f"Failed to update error status for {feed_id}: {e2}")

def threat_feed_scheduler():
    while True:
        try:
            now = datetime.now()
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id, schedule, last_updated FROM threat_feeds")
                feeds = cursor.fetchall()
                
                for feed_id, schedule, last_updated in feeds:
                    if not schedule or " at " not in schedule: continue
                    
                    freq, time_str = schedule.split(" at ")
                    try:
                        sched_time = datetime.strptime(time_str.strip(), "%I:%M %p")
                    except:
                        continue
                        
                    should_run = False
                    if freq == "Hourly":
                        if now.minute == sched_time.minute:
                            should_run = True
                    elif freq == "Daily":
                        if now.hour == sched_time.hour and now.minute == sched_time.minute:
                            should_run = True
                    elif freq == "Weekly":
                        # Simplification: run on Monday if weekly
                        if now.weekday() == 0 and now.hour == sched_time.hour and now.minute == sched_time.minute:
                            should_run = True
                            
                    if should_run:
                        if last_updated:
                            try:
                                # Strip Z / timezone suffix so fromisoformat works on Python < 3.11
                                lu_clean = str(last_updated).replace("Z", "").split("+")[0].split(".")[0]
                                last_dt = datetime.fromisoformat(lu_clean)
                                if (now - last_dt).total_seconds() < 120:
                                    continue
                            except Exception:
                                pass
                        
                        print(f"Executing scheduled sync for feed {feed_id} ({schedule})...")
                        sync_feed_internal(feed_id, conn)
                        
            # Apply Reference Set TTL policies
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id, ttl_days FROM reference_sets WHERE ttl_days > 0")
                for set_id, ttl in cursor.fetchall():
                    try:
                        ttl_int = int(ttl)
                    except (ValueError, TypeError):
                        continue
                    cursor.execute("DELETE FROM reference_set_items WHERE set_id = %s AND added_at <= CURRENT_TIMESTAMP - (INTERVAL '1 day' * %s)", (set_id, ttl_int))
                conn.commit()
        except Exception as e:
            print("Scheduler error:", e)
            
        time.sleep(30)

# Start scheduler thread
scheduler_thread = threading.Thread(target=threat_feed_scheduler, daemon=True)
scheduler_thread.start()


app = FastAPI(
    title="SOC Dashboard API",
    description="Security Operations Center API with PostgreSQL persistence and MITRE ATT&CK mapping",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# init_db() is called in startup_event() with a PG advisory lock.
# NOT here -- running at import time causes multi-worker DDL lock contention.

# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class LogEntry(BaseModel):
    timestamp: str
    source: str
    event_id: Optional[str] = None
    severity: str = "info"
    message: str
    hostname: str
    username: Optional[str] = None
    raw_log: Optional[str] = None
    mitre_tactics: Optional[List[str]] = []
    mitre_techniques: Optional[List[str]] = []

class AlertCreate(BaseModel):
    title: str
    description: str
    severity: str = "medium"
    source: Optional[str] = None
    event_id: Optional[str] = None
    mitre_ref: Optional[str] = None

class StatusUpdate(BaseModel):
    status: str
    resolution_type: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None

class ParserCreate(BaseModel):
    name: str
    regex: str
    description: Optional[str] = None
    active: bool = True
    resolution_type: Optional[str] = None
    notes: Optional[str] = None

class ParserCreate(BaseModel):
    name: str
    regex: str
    description: Optional[str] = None
    active: bool = True
    log_source: Optional[str] = None
    rule_logic: Optional[str] = None

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# UDP Syslog Server (Linux Native Ingestion)
# ---------------------------------------------------------------------------
import asyncio
from datetime import datetime

class SyslogProtocol(asyncio.DatagramProtocol):
    def connection_made(self, transport):
        self.transport = transport
        print("Syslog UDP Server started on port 1514")

    def datagram_received(self, data, addr):
        message = data.decode('utf-8', errors='replace').strip()
        
        # Simple RFC3164 Syslog Parser
        # Format: <PRI>TIMESTAMP HOSTNAME APP-NAME: MESSAGE
        # Example: <34>Oct 11 22:14:15 mymachine su: 'su root' failed for lonvick on /dev/pts/8
        try:
            import re
            
            # Default values
            severity = "medium"
            hostname = addr[0]
            app_name = "syslog"
            content = message
            
            # Parse PRI
            pri_match = re.match(r'^<(\d+)>(.*)', message)
            if pri_match:
                pri = int(pri_match.group(1))
                facility = pri >> 3
                sev = pri & 7
                message_body = pri_match.group(2)
                
                # Map Syslog severity to our severity
                if sev <= 2: severity = "critical"
                elif sev <= 3: severity = "high"
                elif sev <= 4: severity = "medium"
                elif sev <= 6: severity = "low"
                else: severity = "info"
            else:
                message_body = message

            # Try to parse timestamp, hostname, app
            # e.g. Oct 11 22:14:15 hostname app[123]: msg
            body_match = re.match(r'^([A-Z][a-z]{2}\s+\d+\s\d+:\d+:\d+)\s+(\S+)\s+([^:]+):\s+(.*)', message_body)
            if body_match:
                # We ignore the syslog timestamp and use current time for simplicity/standardization
                hostname = body_match.group(2)
                app_name = body_match.group(3).split('[')[0] # strip PID
                content = body_match.group(4)
            else:
                content = message_body

            entry = LogEntry(
                timestamp=datetime.now().isoformat(),
                source=f"Linux-{app_name}",
                severity=severity,
                message=content,
                hostname=hostname,
                username=None,
                raw_log=message
            )
            
            # Process and store the log entry using the shared engine
            conn = get_db()
            process_log_entry(entry, conn)
            conn.commit()
            conn.close()
            
        except Exception as e:
            print(f"Error parsing syslog message from {addr}: {e}")

@app.on_event("startup")
async def startup_event():
    # Step 1: Clean up any stale/idle connections from previous crashed workers.
    # This prevents "idle in transaction" sessions from blocking DDL and inserts.
    try:
        import psycopg as _psycopg
        _cleanup = _psycopg.connect(
            host=DB_HOST, port=DB_PORT, user=DB_USER,
            password=DB_PASSWORD, dbname=DB_NAME
        )
        _cleanup.autocommit = True
        _cc = _cleanup.cursor()
        _cc.execute("""
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = %s
              AND pid != pg_backend_pid()
              AND state IN ('idle', 'idle in transaction')
              AND state_change < now() - interval '10 seconds'
        """, (DB_NAME,))
        _cleaned = len(_cc.fetchall())
        if _cleaned:
            print(f"[startup] Cleaned up {_cleaned} stale PG connections.")
        _cc.execute('SELECT pg_advisory_unlock_all()')
        _cleanup.close()
    except Exception as _ce:
        print(f"[startup] Cleanup warning: {_ce}")

    # Step 2: Open the connection pool NOW — inside uvicorn's running event loop.
    try:
        _get_pool()
        print("[startup] Connection pool opened.")
    except Exception as e:
        print(f"[startup] DB pool open failed: {e}")
        return

    # Step 3: Run DDL exactly once across all workers via a DIRECT connection (not the pool)
    # so init_db() never competes with pool connections.
    try:
        import psycopg as _psycopg
        _direct = _psycopg.connect(
            host=DB_HOST, port=DB_PORT, user=DB_USER,
            password=DB_PASSWORD, dbname=DB_NAME
        )
        _direct.autocommit = True
        _mig_cur = _direct.cursor()
        _mig_cur.execute('SELECT pg_try_advisory_lock(8675309)')
        _won = _mig_cur.fetchone()[0]
        if _won:
            print("[startup] Won advisory lock — running init_db...")
            init_db()
            _mig_cur.execute('SELECT pg_advisory_unlock(8675309)')
            print("[startup] init_db complete, lock released.")
        else:
            print("[startup] Another worker holds lock — skipping DDL.")
        _direct.close()
    except Exception as _e:
        print(f"[startup] init_db error: {_e}")
    # Mount streaming endpoints (memory-safe large log queries)
    app.include_router(streaming_router, prefix="/api")
    # Start 5-minute batch correlation scheduler
    start_batch_scheduler(app)
    # Start the UDP Syslog Server in the background
    loop = asyncio.get_running_loop()
    try:
        transport, protocol = await loop.create_datagram_endpoint(
            lambda: SyslogProtocol(),
            local_addr=('0.0.0.0', 1514)
        )
        app.state.syslog_transport = transport
    except Exception as e:
        print(f"Failed to start Syslog Server: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    if hasattr(app.state, 'syslog_transport'):
        app.state.syslog_transport.close()
    global _pool
    if _pool is not None and not _pool.closed:
        try:
            _pool.close()
        except Exception:
            pass


class ReferenceSetRequest(BaseModel):
    name: str
    type: str
    description: str = ""
    ttl_days: int = 0

@app.get("/api/reference-sets")
def get_reference_sets():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, type, description, ttl_days FROM reference_sets")
        sets = [{"id": r[0], "name": r[1], "type": r[2], "description": r[3], "ttl_days": r[4]} for r in cursor.fetchall()]
        
        for s in sets:
            cursor.execute("SELECT COUNT(*) FROM reference_set_items WHERE set_id = %s", (s["id"],))
            s["count"] = cursor.fetchone()[0]
            
        return {"data": sets}

@app.post("/api/reference-sets")
def create_reference_set(req: ReferenceSetRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        set_id = str(uuid.uuid4())
        cursor.execute("INSERT INTO reference_sets (id, name, type, description, ttl_days) VALUES (%s, %s, %s, %s, %s)", (set_id, req.name, req.type, req.description, req.ttl_days))
        conn.commit()
        return {"status": "success", "id": set_id}

@app.delete("/api/reference-sets/{set_id}")
def delete_reference_set(set_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM reference_sets WHERE id = %s", (set_id,))
        conn.commit()
        return {"status": "success"}

class ReferenceSetItemRequest(BaseModel):
    value: str
    added_by: str = "Administrator"

@app.get("/api/reference-sets/{set_id}/items")
def get_reference_set_items(set_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, value, added_by, added_at FROM reference_set_items WHERE set_id = %s ORDER BY added_at DESC", (set_id,))
        items = [{"id": r[0], "value": r[1], "added_by": r[2], "added_at": r[3]} for r in cursor.fetchall()]
        return {"data": items}

@app.post("/api/reference-sets/{set_id}/items")
def add_reference_set_item(set_id: str, req: ReferenceSetItemRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        item_id = str(uuid.uuid4())
        cursor.execute("INSERT INTO reference_set_items (id, set_id, value, added_by) VALUES (%s, %s, %s, %s)", (item_id, set_id, req.value, req.added_by))
        conn.commit()
        return {"status": "success", "id": item_id}

@app.delete("/api/reference-sets/{set_id}/items/{item_id}")
def delete_reference_set_item(set_id: str, item_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM reference_set_items WHERE id = %s", (item_id,))
        conn.commit()
        return {"status": "success"}


class AlertCommentRequest(BaseModel):
    user: str
    comment: str

@app.get("/api/alerts/{alert_id}/comments")
def get_alert_comments(alert_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id, "user", comment, created_at FROM alert_comments WHERE alert_id = %s ORDER BY created_at ASC', (alert_id,))
        comments = [{"id": r[0], "user": r[1], "comment": r[2], "created_at": r[3]} for r in cursor.fetchall()]
        return {"data": comments}

@app.post("/api/alerts/{alert_id}/comments")
def add_alert_comment(alert_id: str, req: AlertCommentRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        comment_id = str(uuid.uuid4())
        cursor.execute('INSERT INTO alert_comments (id, alert_id, "user", comment) VALUES (%s, %s, %s, %s)', (comment_id, alert_id, req.user, req.comment))
        conn.commit()
        return {"status": "success", "id": comment_id}

import psutil
import os

import subprocess
import psutil

class ServiceActionRequest(BaseModel):
    action: str # start, stop, restart

def get_services_status():
    services = [
        {"id": "api-server", "name": "Core API Server", "type": "backend", "command": "uvicorn api.index:app", "status": "stopped", "pid": None, "started_at": None},
        {"id": "frontend", "name": "Next.js UI Server", "type": "frontend", "command": "next", "status": "stopped", "pid": None, "started_at": None}
    ]
    
    try:
        # We use psutil to find running processes matching our commands
        for p in psutil.process_iter(['pid', 'name', 'cmdline', 'create_time', 'memory_info']):
            try:
                cmdline = p.info.get('cmdline') or []
                cmd = " ".join(cmdline) if cmdline else ""
                if not cmd:
                    continue

                for s in services:
                    if s["command"] in cmd and "service_manager" not in cmd:
                        s["status"] = "running"
                        s["pid"] = p.info['pid']
                        s["started_at"] = p.info.get('create_time')
                        try:
                            mem = p.info.get('memory_info')
                            s["memory_mb"] = round(mem.rss / (1024 * 1024), 1) if mem else 0
                            s["cpu_percent"] = p.cpu_percent(interval=0.05)
                        except Exception:
                            s["memory_mb"] = 0
                            s["cpu_percent"] = 0
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess, TypeError, ValueError):
                pass
                
        # Since this API is answering, API server MUST be running!
        for s in services:
            if s["id"] == "api-server" and s["status"] == "stopped":
                s["status"] = "running"
                s["pid"] = os.getpid()
                self_p = psutil.Process(os.getpid())
                s["started_at"] = self_p.create_time()
                try:
                    s["memory_mb"] = round(self_p.memory_info().rss / (1024 * 1024), 1)
                    s["cpu_percent"] = self_p.cpu_percent(interval=0.05)
                except:
                    s["memory_mb"] = 0
                    s["cpu_percent"] = 0
                
    except Exception as e:
        print("Error getting service status:", e)
        
    return services

@app.get("/api/system/services")
def list_services():
    return {"data": get_services_status()}

@app.post("/api/system/services/{service_id}/action")
def manage_service(service_id: str, req: ServiceActionRequest):
    services = get_services_status()
    service = next((s for s in services if s["id"] == service_id), None)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
        
    action = req.action
    
    # Handle Stop
    if action in ["stop", "restart"] and service["pid"]:
        try:
            p = psutil.Process(service["pid"])
            p.terminate()
            p.wait(timeout=3)
        except:
            try:
                psutil.Process(service["pid"]).kill()
            except:
                pass
                
    if action == "stop":
        return {"status": "success", "message": f"{service['name']} stopped"}
        
    # Handle Start
    if action in ["start", "restart"]:
        try:

            if service_id == "api-server":
                # Dangerous to restart self, but we can spawn a detached process that waits 1 sec then starts
                # For safety, let's just use subprocess
                subprocess.Popen(["python", "restart_api.py"], creationflags=subprocess.DETACHED_PROCESS if os.name == 'nt' else 0, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
            elif service_id == "frontend":
                subprocess.Popen(["npm", "run", "dev"], shell=True, creationflags=subprocess.DETACHED_PROCESS if os.name == 'nt' else 0)
                
            return {"status": "success", "message": f"{service['name']} started"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
            
    return {"status": "error", "message": "Invalid action"}


@app.get("/api/system/health")
def system_health_status():
    try:
        mem = psutil.virtual_memory()
        cpu = psutil.cpu_percent(interval=0.5)
        
        # Network stats
        net_if_addrs = psutil.net_if_addrs()
        net_if_stats = psutil.net_if_stats()
        
        interfaces = []
        for interface_name, addrs in net_if_addrs.items():
            stats = net_if_stats.get(interface_name)
            is_up = stats.isup if stats else False
            speed = stats.speed if stats else 0
            # Filter to active/up interfaces with an IPv4 address
            has_ipv4 = any(addr.family == 2 for addr in addrs)
            if is_up and has_ipv4 and interface_name != "Loopback Pseudo-Interface 1":
                interfaces.append({
                    "name": interface_name,
                    "speed": f"{speed} Mbps" if speed > 0 else "Unknown",
                    "status": "up" if is_up else "down"
                })
        
        return {
            "status": "healthy",
            "cpu_percent": cpu,
            "ram": {
                "total_gb": round(mem.total / (1024**3), 1),
                "used_gb": round(mem.used / (1024**3), 1),
                "percent": mem.percent
            },
            "interfaces": interfaces,
            "boot_time": psutil.boot_time()
        }
    except Exception as e:
        print("Health check error:", e)
        return {"status": "error", "message": str(e)}

@app.get("/api/health")
def health_check():
    """Health check with database status."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM logs")
        log_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM alerts")
        alert_count = cursor.fetchone()[0]
    return {
        "status": "ok",
        "database": "postgresql",
        "db_host": f"{DB_HOST}:{DB_PORT}/{DB_NAME}",
        "total_logs": log_count,
        "total_alerts": alert_count,
        "timestamp": datetime.now().isoformat(),
    }


class UseCaseCreate(BaseModel):
    title: str
    description: Optional[str] = None
    type: str
    event_id: Optional[str] = None
    mitre_technique: Optional[str] = None
    threshold_count: Optional[int] = None
    severity: str
    active: bool = True
    log_source: Optional[str] = None
    rule_logic: Optional[str] = None

# ---------------------------------------------------------------------------
# System / Services endpoints (Vector Agent + host tracking)
# ---------------------------------------------------------------------------

def _get_windows_service_status(svc_name: str) -> dict:
    """Query a Windows service via sc.exe. Returns status, pid, start_type."""
    result = {"status": "stopped", "pid": None, "start_type": "unknown"}
    try:
        out = subprocess.check_output(
            ["sc.exe", "query", svc_name], stderr=subprocess.DEVNULL, timeout=4
        ).decode(errors="replace")
        if "RUNNING" in out:
            result["status"] = "running"
            try:
                out2 = subprocess.check_output(
                    ["sc.exe", "qc", svc_name], stderr=subprocess.DEVNULL, timeout=4
                ).decode(errors="replace")
                result["start_type"] = "automatic" if "AUTO_START" in out2 else "manual"
            except Exception:
                pass
            try:
                tl = subprocess.check_output(
                    ["tasklist", "/FI", "IMAGENAME eq vector.exe", "/FO", "CSV", "/NH"],
                    stderr=subprocess.DEVNULL, timeout=4
                ).decode(errors="replace")
                for line in tl.strip().splitlines():
                    parts = line.strip('"').split('","')
                    if len(parts) >= 2:
                        try:
                            result["pid"] = int(parts[1])
                        except ValueError:
                            pass
                        break
            except Exception:
                pass
        elif "STOPPED" in out:
            result["status"] = "stopped"
        elif "1060" in out or "does not exist" in out.lower():
            result["status"] = "not_installed"
    except Exception:
        result["status"] = "not_installed"
    return result


def get_services_status():
    services = [
        {"id": "api-server",   "name": "Core API Server",    "type": "backend",   "command": "uvicorn api.index:app", "status": "stopped", "pid": None, "started_at": None},
        {"id": "frontend",     "name": "Next.js UI Server",  "type": "frontend",  "command": "next",                  "status": "stopped", "pid": None, "started_at": None},
        {"id": "vector-agent", "name": "Vector Log Agent",   "type": "collector", "command": "VectorAgent",           "status": "stopped", "pid": None, "started_at": None,
         "service_name": "VectorAgent", "description": "Windows Event Log collector (auto-starts on reboot)"},
    ]

    try:
        for p in psutil.process_iter(['pid', 'name', 'cmdline', 'create_time', 'memory_info']):
            try:
                cmd = " ".join(p.info['cmdline']) if p.info['cmdline'] else ""
                for s in services:
                    if s["id"] == "vector-agent":
                        continue
                    if s["command"] in cmd and "service_manager" not in cmd:
                        s["status"] = "running"
                        s["pid"] = p.info['pid']
                        s["started_at"] = p.info['create_time']
                        try:
                            s["memory_mb"] = round(p.info['memory_info'].rss / (1024 * 1024), 1)
                            s["cpu_percent"] = p.cpu_percent(interval=0.05)
                        except Exception:
                            s["memory_mb"] = 0
                            s["cpu_percent"] = 0
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass

        # API is answering so it must be running
        for s in services:
            if s["id"] == "api-server" and s["status"] == "stopped":
                s["status"] = "running"
                s["pid"] = os.getpid()
                self_p = psutil.Process(os.getpid())
                s["started_at"] = self_p.create_time()
                try:
                    s["memory_mb"] = round(self_p.memory_info().rss / (1024 * 1024), 1)
                    s["cpu_percent"] = self_p.cpu_percent(interval=0.05)
                except Exception:
                    s["memory_mb"] = 0
                    s["cpu_percent"] = 0

        # Vector Agent: check process directly (works whether running as service OR background process)
        for s in services:
            if s["id"] == "vector-agent":
                # First check if vector.exe process is actually running (most reliable)
                vector_proc = None
                try:
                    for p in psutil.process_iter(['pid', 'name', 'create_time', 'memory_info', 'cmdline']):
                        try:
                            if (p.info['name'] or "").lower() in ("vector.exe", "vector"):
                                vector_proc = p
                                break
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass
                except Exception:
                    pass

                if vector_proc:
                    # Process is running — mark as running regardless of service state
                    s["status"] = "running"
                    s["pid"] = vector_proc.info['pid']
                    try:
                        s["started_at"] = vector_proc.info['create_time']
                        s["memory_mb"] = round(vector_proc.info['memory_info'].rss / (1024 * 1024), 1)
                        s["cpu_percent"] = vector_proc.cpu_percent(interval=0.05)
                    except Exception:
                        pass
                    # Also query the service to get start_type info
                    svc_info = _get_windows_service_status("VectorAgent")
                    s["start_type"] = svc_info.get("start_type", "auto")
                else:
                    # Process not running — check service state
                    svc_info = _get_windows_service_status("VectorAgent")
                    s["status"] = "stopped"
                    s["pid"] = None
                    s["start_type"] = svc_info.get("start_type", "auto")

    except Exception as e:
        print("Error getting service status:", e)

    return services


@app.get("/api/system/vector/agents")
def get_vector_agents():
    """Per-host stats for every host that has sent logs via Vector."""
    try:
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
            import datetime as _dt
            now_ts = _dt.datetime.now(_dt.timezone.utc).timestamp()

            def _to_iso(val):
                if val is None:
                    return None
                if hasattr(val, 'isoformat'):
                    return val.isoformat()
                s = str(val).strip()
                if len(s) >= 19 and s[10] == ' ':
                    s = s[:10] + 'T' + s[11:]
                return s if s else None

            agents = []
            for row in rows:
                # Use dict key access -- rows are DictRow dicts, not plain tuples
                hostname   = row['hostname']
                log_count  = row['log_count']
                last_seen  = row['last_seen']
                first_seen = row['first_seen']
                crit = row['critical_count']
                high = row['high_count']
                med  = row['medium_count']
                low  = row['low_count']

                try:
                    if hasattr(last_seen, 'timestamp'):
                        # psycopg3 returns aware datetime for timestamptz columns
                        last_ts = last_seen.timestamp()
                    else:
                        s = str(last_seen).strip().replace(' ', 'T')
                        parsed = _dt.datetime.fromisoformat(s)
                        if parsed.tzinfo is None:
                            # Treat naive timestamps as UTC
                            parsed = parsed.replace(tzinfo=_dt.timezone.utc)
                        last_ts = parsed.timestamp()
                    age_mins = (now_ts - last_ts) / 60
                    sync_status = "live" if age_mins < 5 else ("recent" if age_mins < 30 else "stale")
                except Exception:
                    sync_status = "unknown"

                agents.append({
                    "hostname":    hostname,
                    "log_count":   int(log_count) if log_count is not None else 0,
                    "last_seen":   _to_iso(last_seen),
                    "first_seen":  _to_iso(first_seen),
                    "sync_status": sync_status,
                    "severity_breakdown": {
                        "critical": int(crit or 0),
                        "high":     int(high or 0),
                        "medium":   int(med  or 0),
                        "low":      int(low  or 0),
                    }
                })
            # Enrich with user-assigned criticality
            cursor.execute("SELECT hostname, criticality FROM device_criticality")
            crit_map = {r['hostname']: r['criticality'] for r in cursor.fetchall()}
            for a in agents:
                a['criticality'] = crit_map.get(a['hostname'], 'low')
            return {"data": agents}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class DeviceCriticalityRequest(BaseModel):
    criticality: str  # low | medium | high | critical

@app.patch("/api/system/vector/agents/{hostname}/criticality")
def set_device_criticality(hostname: str, req: DeviceCriticalityRequest):
    """Set user-assigned criticality level for a connected host."""
    valid = {'low', 'medium', 'high', 'critical'}
    if req.criticality not in valid:
        raise HTTPException(status_code=400, detail=f"criticality must be one of {sorted(valid)}")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO device_criticality (hostname, criticality, updated_at)
            VALUES (%s, %s, NOW())
            ON CONFLICT (hostname) DO UPDATE
              SET criticality = EXCLUDED.criticality,
                  updated_at  = NOW()
        """, (hostname, req.criticality))
    return {"status": "ok", "hostname": hostname, "criticality": req.criticality}


@app.get("/api/system/services")
def list_services():
    return {"data": get_services_status()}


@app.post("/api/system/services/{service_id}/action")
def manage_service(service_id: str, req: ServiceActionRequest):
    services = get_services_status()
    service = next((s for s in services if s["id"] == service_id), None)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    action = req.action

    # Stop phase
    if action in ["stop", "restart"]:
        if service_id == "vector-agent":
            # Try service stop first, then kill process directly
            try:
                subprocess.run(["sc.exe", "stop", "VectorAgent"], capture_output=True, timeout=8)
            except Exception:
                pass
            # Kill process directly regardless (works without admin)
            try:
                subprocess.run(["taskkill", "/F", "/IM", "vector.exe"], capture_output=True, timeout=8)
            except Exception:
                pass
        elif service.get("pid"):
            try:
                p = psutil.Process(service["pid"])
                p.terminate()
                p.wait(timeout=3)
            except Exception:
                try:
                    psutil.Process(service["pid"]).kill()
                except Exception:
                    pass

    if action == "stop":
        return {"status": "success", "message": f"{service['name']} stopped"}

    # Start phase
    if action in ["start", "restart"]:
        try:
            if service_id == "api-server":
                subprocess.Popen(
                    ["python", "restart_api.py"],
                    creationflags=subprocess.DETACHED_PROCESS if os.name == 'nt' else 0,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL
                )
            elif service_id == "frontend":
                subprocess.Popen(["npm", "run", "dev"], shell=True,
                    creationflags=subprocess.DETACHED_PROCESS if os.name == 'nt' else 0)
            elif service_id == "vector-agent":
                # Check if already running as a process
                already_running = False
                try:
                    for p in psutil.process_iter(['name']):
                        if (p.info.get('name') or "").lower() in ("vector.exe", "vector"):
                            already_running = True
                            break
                except Exception:
                    pass

                if already_running:
                    return {"status": "success", "message": "Vector Log Agent is already running"}

                # Try Windows Service first (works if running as admin)
                svc_started = False
                try:
                    result = subprocess.run(["sc.exe", "start", "VectorAgent"], capture_output=True, timeout=10)
                    out = (result.stdout or b"").decode(errors="replace")
                    if result.returncode == 0 or "1056" in out or "already running" in out.lower():
                        svc_started = True
                except Exception:
                    pass

                if not svc_started:
                    # Fallback: launch vector.exe directly as a background process (no admin needed)
                    VECTOR_EXE = r"C:\Program Files\Vector\bin\vector.exe"
                    VECTOR_CFG = r"D:\SOC-Dashboard\Dashboard\vector\vector-windows-agent.toml"
                    subprocess.Popen(
                        [VECTOR_EXE, "--config", VECTOR_CFG],
                        creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        stdin=subprocess.DEVNULL,
                        close_fds=True,
                    )
                    import time as _time; _time.sleep(2)
                    # Verify it actually started
                    running = any(
                        (p.info.get('name') or "").lower() in ("vector.exe", "vector")
                        for p in psutil.process_iter(['name'])
                    )
                    if not running:
                        raise Exception("Vector failed to start. Check the config and logs.")
            return {"status": "success", "message": f"{service['name']} started"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return {"status": "error", "message": "Invalid action"}


@app.get("/api/system/health")
def system_health_status():
    try:
        mem = psutil.virtual_memory()
        cpu = psutil.cpu_percent(interval=0.5)
        
        # Network stats
        net_if_addrs = psutil.net_if_addrs()
        net_if_stats = psutil.net_if_stats()
        
        interfaces = []
        for interface_name, addrs in net_if_addrs.items():
            stats = net_if_stats.get(interface_name)
            is_up = stats.isup if stats else False
            speed = stats.speed if stats else 0
            # Filter to active/up interfaces with an IPv4 address
            has_ipv4 = any(addr.family == 2 for addr in addrs)
            if is_up and has_ipv4 and interface_name != "Loopback Pseudo-Interface 1":
                interfaces.append({
                    "name": interface_name,
                    "speed": f"{speed} Mbps" if speed > 0 else "Unknown",
                    "status": "up" if is_up else "down"
                })
        
        return {
            "status": "healthy",
            "cpu_percent": cpu,
            "ram": {
                "total_gb": round(mem.total / (1024**3), 1),
                "used_gb": round(mem.used / (1024**3), 1),
                "percent": mem.percent
            },
            "interfaces": interfaces,
            "boot_time": psutil.boot_time()
        }
    except Exception as e:
        print("Health check error:", e)
        return {"status": "error", "message": str(e)}

@app.get("/api/sources")
def get_sources():
    """Return only real integrated devices -- no mock/fake data."""
    conn = get_db()
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
        hostname    = r['hostname']
        last_seen   = r['last_seen']
        first_seen  = r['first_seen']

        # Determine status from actual last_seen -- no fake generation
        try:
            import datetime as _dt
            if hasattr(last_seen, 'timestamp'):
                age_secs = (_dt.datetime.utcnow().replace(tzinfo=_dt.timezone.utc) - last_seen.astimezone(_dt.timezone.utc)).total_seconds()
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
            # Only include real metadata -- None means not registered in endpoint_agents
            "ip_address":    r['ip_address'],
            "os_version":    r['os_version'],
            "protocol":      r['protocol'],
            "agent_version": r['agent_version'],
            "link_speed":    r['link_speed'],
            "eps":           r['eps'],
        })
    return sources

@app.delete("/api/sources/{hostname}")
def delete_source(hostname: str):
    conn = get_db()
    cursor = conn.cursor()
    # Delete logs for this host to effectively "remove" the source
    cursor.execute("DELETE FROM logs WHERE hostname = %s", (hostname,))
    cursor.execute("DELETE FROM endpoint_agents WHERE hostname = %s", (hostname,))
    conn.commit()
    return {"status": "success"}

@app.patch("/api/sources/{hostname}")
def update_source(hostname: str, req: dict):
    conn = get_db()
    cursor = conn.cursor()
    # Upsert the agent metadata
    cursor.execute("SELECT 1 FROM endpoint_agents WHERE hostname = %s", (hostname,))
    if cursor.fetchone():
        cursor.execute("UPDATE endpoint_agents SET ip_address=%s, os_version=%s, protocol=%s, agent_version=%s, link_speed=%s WHERE hostname=%s",
                      (req.get('ip_address'), req.get('os_version'), req.get('protocol'), req.get('agent_version'), req.get('link_speed'), hostname))
    else:
        cursor.execute("INSERT INTO endpoint_agents (hostname, ip_address, os_version, protocol, agent_version, link_speed) VALUES (%s, %s, %s, %s, %s, %s)",
                      (hostname, req.get('ip_address'), req.get('os_version'), req.get('protocol'), req.get('agent_version'), req.get('link_speed')))
    conn.commit()
    return {"status": "success"}


@app.get("/api/usecases")
def get_usecases():
    conn = get_db()
    rows = conn.execute("SELECT * FROM use_cases ORDER BY title").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/usecases")
def create_usecase(uc: UseCaseCreate):
    conn = get_db()
    uc_id = f"UC-{str(uuid.uuid4())[:8].upper()}"
    conn.execute("""
        INSERT INTO use_cases (id, title, description, type, event_id, mitre_technique, threshold_count, severity, active, rule_logic)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (uc_id, uc.title, uc.description, uc.type, uc.event_id, uc.mitre_technique, uc.threshold_count, uc.severity, uc.active, uc.rule_logic))
    conn.commit()
    conn.close()
    return {"id": uc_id, "status": "created"}

@app.delete("/api/usecases/{uc_id}")
def delete_usecase(uc_id: str):
    conn = get_db()
    conn.execute("DELETE FROM use_cases WHERE id = %s", (uc_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.get("/api/parsers")
def get_parsers():
    conn = get_db()
    rows = conn.execute("SELECT * FROM parsers ORDER BY name").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/parsers")
def create_parser(parser: ParserCreate):
    conn = get_db()
    parser_id = str(uuid.uuid4())
    conn.execute("""
        INSERT INTO parsers (id, name, regex, description, active, log_source)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (parser_id, parser.name, parser.regex, parser.description, parser.active))
    conn.commit()
    conn.close()
    return {"id": parser_id, "status": "created"}

@app.delete("/api/parsers/{parser_id}")
def delete_parser(parser_id: str):
    conn = get_db()
    conn.execute("DELETE FROM parsers WHERE id = %s", (parser_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.post("/api/logs/ingest")
async def ingest_logs(request: Request):
    """Ingest logs from Vector/Windows collectors.
    Accepts:
      - JSON array: [{...}, {...}]
      - Newline-delimited JSON (ndjson): {...}\n{...}\n  (Vector default framing)
      - Single JSON object: {...}
    """
    raw = await request.body()
    text = raw.decode("utf-8", errors="replace").strip()

    entries_raw = []
    # Try JSON array first
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            entries_raw = parsed
        elif isinstance(parsed, dict):
            entries_raw = [parsed]
    except json.JSONDecodeError:
        # Fall back to ndjson (one JSON object per line)
        for line in text.splitlines():
            line = line.strip()
            if line:
                try:
                    entries_raw.append(json.loads(line))
                except json.JSONDecodeError:
                    pass  # skip malformed lines

    if not entries_raw:
        return {"status": "ok", "ingested": 0}

    entries = []
    for raw_entry in entries_raw:
        try:
            # Normalize Vector Windows agent fields into LogEntry schema
            mapped = {k: v for k, v in raw_entry.items() if k in LogEntry.model_fields}

            # raw_log: if Vector deserialized the JSON object, re-serialize it
            if "raw_log" in raw_entry:
                rl = raw_entry["raw_log"]
                if isinstance(rl, dict):
                    mapped["raw_log"] = json.dumps(rl)
                elif isinstance(rl, str):
                    mapped["raw_log"] = rl

            # username: also check inside parsed raw_log extracted_fields
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

            # mitre fields from Vector
            if "mitre_tactics" in raw_entry:
                v = raw_entry["mitre_tactics"]
                mapped["mitre_tactics"] = v if isinstance(v, list) else []
            if "mitre_techniques" in raw_entry:
                v = raw_entry["mitre_techniques"]
                mapped["mitre_techniques"] = v if isinstance(v, list) else []

            entries.append(LogEntry(**mapped))
        except Exception:
            pass  # skip entries missing required fields

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name, regex FROM parsers WHERE active = true")
        active_parsers = cursor.fetchall()
        cursor.execute(
            "SELECT id, title, type, event_id, severity, mitre_technique, threshold_count FROM use_cases WHERE active = true"
        )
        rows = cursor.fetchall()
        uc_cols = ["id", "title", "type", "event_id", "severity", "mitre_technique", "threshold_count"]
        active_usecases = [dict(zip(uc_cols, r)) for r in rows]

        for entry in entries:
            process_log_entry(entry, conn, active_parsers, active_usecases)

        conn.commit()
    return {"status": "ok", "ingested": len(entries)}

def process_log_entry(entry: LogEntry, conn, active_parsers, active_usecases):
    """Core logic to parse, evaluate use cases, and store a log entry."""
    cursor = conn.cursor()
    
    # Fetch active parsers
    

    import uuid, json, re
    
    src_ip = None
    dest_ip = None

    # First: pull src_ip/dest_ip from structured parsed fields in raw_log (Vector Windows events)
    _raw_obj = None
    if entry.raw_log and entry.raw_log.startswith("{"):
        try:
            _raw_obj = json.loads(entry.raw_log)
        except Exception:
            pass
    if _raw_obj:
        _ef = _raw_obj.get("extracted_fields", {})
        src_ip  = _ef.get("src_ip") or None
        dest_ip = _ef.get("dest_ip") or None

    # Fallback: regex on message text (fixed — was double-escaped)
    if not src_ip:
        src_match = re.search(r'Source Network Address:\s*([\d\.]+)', entry.message)
        if not src_match:
            src_match = re.search(r'src_ip=([\d\.]+)', entry.message)
        if src_match:
            src_ip = src_match.group(1)

    if not dest_ip:
        dest_match = re.search(r'Dest(?:ination)? Network Address:\s*([\d\.]+)', entry.message)
        if not dest_match:
            dest_match = re.search(r'dest_ip=([\d\.]+)', entry.message)
        if dest_match:
            dest_ip = dest_match.group(1)

    # Last resort: first two public IPs found anywhere in message
    if not src_ip:
        ips = re.findall(r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b', entry.message)
        ips = [ip for ip in ips if ip not in ('127.0.0.1', '0.0.0.0', '255.255.255.255')]
        if ips:
            src_ip = ips[0]
            if len(ips) > 1:
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
                # Try matching against raw_log first, fallback to message
                match = re.search(parser["regex"], entry.raw_log or "") or re.search(parser["regex"], entry.message or "")
                if match:
                    # Only add named capture groups
                    groups = {k: v for k, v in match.groupdict().items() if v is not None}
                    raw_data["extracted_fields"].update(groups)
                    
            raw_log = json.dumps(raw_data)
        except Exception:
            pass 

    cursor.execute("""
        INSERT INTO logs (id, timestamp, source, event_id, severity, message, hostname, username, raw_log, mitre_tactics, mitre_techniques, source_ip, destination_ip)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        log_id, entry.timestamp, entry.source, entry.event_id, entry.severity, 
        entry.message, entry.hostname, entry.username, raw_log, 
        mitre_tactics_json, mitre_techniques_json, src_ip, dest_ip
    ))

    # ── Auto-register / update endpoint_agents so Log Sources page shows active ──
    # Use a separate autocommit connection so a lock conflict never blocks the main
    # log INSERT transaction. NOWAIT means it skips the update if busy — non-fatal.
    if entry.hostname:
        try:
            _ea_conn = psycopg.connect(
                host=DB_HOST, port=DB_PORT, user=DB_USER,
                password=DB_PASSWORD, dbname=DB_NAME
            )
            _ea_conn.autocommit = True
            _ea_cur = _ea_conn.cursor()
            _ea_cur.execute("""
                INSERT INTO endpoint_agents (hostname, protocol, agent_version, link_speed, last_seen)
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT (hostname) DO UPDATE
                    SET protocol      = EXCLUDED.protocol,
                        agent_version = EXCLUDED.agent_version,
                        last_seen     = NOW()
            """, (entry.hostname, "Vector/HTTP", "0.41.1", "1 Gbps"))
            _ea_conn.close()
        except Exception:
            pass  # non-fatal — log was already inserted

    # ── TI IOC Auto-Detection ─────────────────────────────────────────────────
    # Extract all indicators from the log and check against threat_indicators.
    # If any hit is found, immediately create a HIGH/CRITICAL alert regardless
    # of use-case rules, so every log with a known-bad IOC surfaces automatically.
    try:
        PRIVATE_IP_RE = re.compile(
            r'^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.0\.0\.0|255\.255)'
        )
        _combined_text = " ".join(filter(None, [
            entry.message or "", entry.raw_log or "",
            entry.hostname or "", entry.username or ""
        ]))
        # Extract public IPs
        _ips = [
            ip for ip in re.findall(r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b', _combined_text)
            if ip not in ('0.0.0.0', '255.255.255.255') and not PRIVATE_IP_RE.match(ip)
        ]
        # Extract SHA256 hashes
        _sha256 = re.findall(r'\b[0-9a-fA-F]{64}\b', _combined_text)
        # Extract MD5 hashes
        _md5 = re.findall(r'\b[0-9a-fA-F]{32}\b', _combined_text)
        # Extract domains (basic)
        _domains = re.findall(
            r'\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|io|ru|cn|de|uk|fr|info|biz|xyz|top|club|online|site|tk|ml|ga|cf|gq)\b',
            _combined_text
        )
        # Extract URLs
        _urls = re.findall(r'https?://[^\s"\'<>]+', _combined_text)

        _iocs = list(dict.fromkeys(_ips + _sha256 + _md5 + _domains + _urls))[:40]

        if _iocs:
            _placeholders = ",".join(["%s"] * len(_iocs))
            _ti_rows = cursor.execute(
                f"""SELECT DISTINCT ti.indicator, ti.type, tf.name
                    FROM threat_indicators ti
                    JOIN threat_feeds tf ON ti.feed_id = tf.id
                    WHERE ti.indicator IN ({_placeholders})
                    LIMIT 10""",
                _iocs
            ).fetchall()

            if _ti_rows:
                # Build a deduplicated summary of hits
                _hit_lines = [f"{r[0]} ({r[1]}) — {r[2]}" for r in _ti_rows]
                _hit_summary = "; ".join(_hit_lines[:5])
                _ioc_types = list({r[1] for r in _ti_rows})
                # Severity: critical if hash/malware match, high for IP/domain
                _ti_sev = "critical" if any(t in ("sha256_hash", "md5_hash", "malware_download") for t in _ioc_types) else "high"
                _ti_alert_title = f"[TI Match] {len(_ti_rows)} IOC{'s' if len(_ti_rows) > 1 else ''} matched on {entry.hostname or entry.source}"
                _ti_description = (
                    f"Threat Intelligence auto-detection fired on log from {entry.hostname or 'unknown host'}.\n"
                    f"Matched IOCs: {_hit_summary}\n"
                    f"Original event: {(entry.message or '')[:200]}"
                )
                # Dedup: skip if an identical TI alert fired in the last 5 minutes for same host+ioc
                _recent = cursor.execute(
                    """SELECT COUNT(*) FROM alerts
                       WHERE title LIKE %s
                       AND timestamp > NOW() - INTERVAL '5 minutes'""",
                    (f"%TI Match%{entry.hostname or entry.source}%",)
                ).fetchone()[0]
                if _recent == 0:
                    _ti_alert_id = str(uuid.uuid4())
                    cursor.execute(
                        """INSERT INTO alerts
                           (id, timestamp, title, description, severity, status, source, event_id, mitre_ref, raw_log, extracted_fields)
                           VALUES (%s, %s, %s, %s, %s, 'new', %s, %s, %s, %s, %s)""",
                        (
                            _ti_alert_id, entry.timestamp, _ti_alert_title, _ti_description,
                            _ti_sev, entry.source, entry.event_id,
                            "T1071",  # Command and Control (generic MITRE for TI matches)
                            raw_log, json.dumps({"ti_hits": _hit_lines})
                        )
                    )
    except Exception as _ti_err:
        pass  # TI check must never break log ingestion

    # Fetch Active Use Cases
    

    # Evaluate Use Cases
    alert_triggered = False
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
                        "SELECT COUNT(*) FROM alerts WHERE title LIKE %s AND timestamp > NOW() - INTERVAL '5 minutes'",
                        (f"%{uc['title']}%",)
                    ).fetchone()[0]
                    
                    if recent_alert == 0:
                        alert_triggered = True
                        alert_title = f"[Threshold: {uc['title']}] {count} events on {entry.hostname}"
                        alert_sev = uc["severity"]
                        mitre_ref = uc["mitre_technique"]
                        break

    # Fallback basic alert
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
        # ── SOAR: fire matching playbooks for this alert ──────────────────────
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
                            pass  # playbook failures must never break ingestion
        except Exception:
            pass  # SOAR errors must never break ingestion

    # ── Stream correlation: evaluate match-type rules in RAM ──────────────────
    try:
        correlation_engine.process_stream(entry.model_dump())
    except Exception as _corr_err:
        pass  # correlation errors must never break ingestion

@app.get("/api/logs")
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
    # Advanced filter: JSON array of {field, op, value, logic} objects
    filters: Optional[str] = None,
):
    """Retrieve stored logs with pagination, full-text and advanced field filtering."""
    conditions = []
    params: list = []

    # ---------- Simple quick filters ----------
    if severity and severity != "all":
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

    # ---------- Advanced filter builder ----------
    # filters = JSON array: [{field, op, value, logic}]
    # Supported ops: =, !=, contains, not_contains, starts_with, ends_with, >, <, >=, <=, is_null, is_not_null, in
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
                op    = f.get("op", "contains").lower()
                val   = f.get("value", "")
                if not field:
                    continue
                if op == "=" or op == "equals":
                    advanced_parts.append(f"LOWER({field}) = LOWER(%s)")
                    params.append(str(val))
                elif op == "!=" or op == "not_equals":
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
            pass  # malformed JSON, ignore

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM logs {where}", params)
        total = cur.fetchone()["count"]

        # Histogram: count per hour for the last 24 h (for trend bar)
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
        tactics    = json.loads(r["mitre_tactics"])    if r["mitre_tactics"]    else []
        techniques = json.loads(r["mitre_techniques"]) if r["mitre_techniques"] else []
        try:
            raw_log_obj = json.loads(r["raw_log"]) if (r["raw_log"] and str(r["raw_log"]).startswith("{")) else r["raw_log"]
        except Exception:
            raw_log_obj = r["raw_log"]

        raw_severity  = (r["severity"] or "info").lower()
        norm_severity = (
            "medium" if raw_severity == "warning"
            else "high"   if raw_severity == "error"
            else raw_severity
        )

        ts_val = r["timestamp"]
        ts_str = ts_val.isoformat() if hasattr(ts_val, "isoformat") else str(ts_val) if ts_val else None

        formatted_logs.append({
            "id":            r["id"],
            "timestamp":     ts_str,
            "source":        r["source"],
            "eventId":       r["event_id"],
            "logType":       r["log_type"] or "Windows Event",
            "severity":      norm_severity,
            "sourceIp":      r["source_ip"],
            "destinationIp": r["destination_ip"],
            "message":       r["message"],
            "hostname":      r["hostname"],
            "username":      r["username"],
            "rawLog":        raw_log_obj,
            "mitreTactic":   tactics[0]    if tactics    else None,
            "mitreTechnique":techniques[0] if techniques else None,
        })

    return {
        "data":      formatted_logs,
        "total":     total,
        "page":      page,
        "limit":     limit,
        "pages":     (total + limit - 1) // limit,
        "histogram": histogram,
    }


@app.get("/api/mitre/mappings")
def get_mitre_mappings(platform: Optional[str] = None):
    """Return MITRE ATT&CK event ID mappings from the database."""
    conn = get_db()
    if platform:
        rows = conn.execute("SELECT * FROM mitre_mappings WHERE platform = %s ORDER BY tactic_id", [platform]).fetchall()
    else:
        rows = conn.execute("SELECT * FROM mitre_mappings ORDER BY tactic_id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/alerts")
def get_alerts(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    """Retrieve alerts with optional filtering."""
    conn = get_db()
    conditions = []
    params: list = []

    if status and status != "all":
        conditions.append("status = %s")
        params.append(status)
    if severity and severity != "all":
        conditions.append("severity = %s")
        params.append(severity)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM alerts {where}", params)
        total = cur.fetchone()["count"]

        offset = (page - 1) * limit
        cur.execute(
            f"SELECT * FROM alerts {where} ORDER BY timestamp DESC LIMIT %s OFFSET %s",
            params + [limit, offset]
        )
        rows = cur.fetchall()

    return {
        "data": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "limit": limit,
    }


@app.post("/api/alerts")
def create_alert(alert: AlertCreate):
    """Manually create an alert."""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            alert_id = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO alerts (id, timestamp, title, description, severity, status, source, event_id, mitre_ref, raw_log, extracted_fields)
                VALUES (%s, %s, %s, %s, %s, 'new', %s, %s, %s, %s, %s)
            """, (
                alert_id,
                datetime.now().isoformat(),
                alert.title,
                alert.description,
                alert.severity,
                alert.source,
                alert.event_id,
                alert.mitre_ref,
                None,
                None,
            ))
            conn.commit()
            return {"id": alert_id, "status": "created"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.patch("/api/alerts/{alert_id}")
def update_alert_status(alert_id: str, update: StatusUpdate):
    """Update the status of an alert and add investigation notes."""
    conn = get_db()
    
    # Dynamically build the update query
    fields = ["status = %s", "updated_at = CURRENT_TIMESTAMP"]
    params = [update.status]
    
    if update.resolution_type is not None:
        fields.append("resolution_type = %s")
        params.append(update.resolution_type)
        
    if update.assigned_to is not None:
        fields.append("assigned_to = %s")
        params.append(update.assigned_to)
        
    if update.notes is not None:
        fields.append("notes = %s")
        params.append(update.notes)
        # Also add it to the investigation timeline
        import uuid
        comment_id = str(uuid.uuid4())
        conn.execute('INSERT INTO alert_comments (id, alert_id, "user", comment) VALUES (%s, %s, %s, %s)', 
                     (comment_id, alert_id, "System", f"Alert resolved with notes: {update.notes}"))
        
    params.append(alert_id)
    
    query = f"UPDATE alerts SET {', '.join(fields)} WHERE id = %s"
    cursor = conn.execute(query, params)
    
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Alert not found")
        
    conn.commit()
    conn.close()
    return {"id": alert_id, "status": update.status}


@app.get("/api/stats")
def get_stats():
    """Dashboard statistics computed from the database."""
    conn = get_db()

    total_logs = conn.execute("SELECT COUNT(*) FROM logs").fetchone()[0]
    total_alerts = conn.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
    critical_alerts = conn.execute("SELECT COUNT(*) FROM alerts WHERE severity = 'critical'").fetchone()[0]
    new_alerts = conn.execute("SELECT COUNT(*) FROM alerts WHERE status = 'new'").fetchone()[0]

    # Severity distribution
    severity_rows = conn.execute(
        "SELECT severity, COUNT(*) as count FROM logs GROUP BY severity ORDER BY count DESC"
    ).fetchall()

    # Top event IDs
    top_events = conn.execute(
        "SELECT event_id, COUNT(*) as count FROM logs WHERE event_id IS NOT NULL GROUP BY event_id ORDER BY count DESC LIMIT 10"
    ).fetchall()

    # Logs by hour (last 24h) — PostgreSQL syntax
    logs_by_hour = conn.execute("""
        SELECT to_char(date_trunc('hour', timestamp), 'HH24:00') as hour, COUNT(*) as count
        FROM logs
        WHERE timestamp >= NOW() - INTERVAL '24 hours'
        GROUP BY date_trunc('hour', timestamp)
        ORDER BY date_trunc('hour', timestamp)
    """).fetchall()

    # Unique hostnames (active sources)
    active_sources = conn.execute("SELECT COUNT(DISTINCT hostname) FROM logs").fetchone()[0]

    # MITRE coverage
    total_techniques = conn.execute("SELECT COUNT(DISTINCT technique_id) FROM mitre_mappings").fetchone()[0]
    
    detected_techniques_list = conn.execute("""
        SELECT mt.technique_id, MAX(mt.severity) as max_severity, COUNT(*) as hit_count
        FROM mitre_mappings mt 
        INNER JOIN logs l ON l.event_id = mt.event_id
        GROUP BY mt.technique_id
    """).fetchall()
    
    detected_techniques = len(detected_techniques_list)

    # Top sources by log volume
    top_sources_rows = conn.execute(
        "SELECT source, COUNT(*) as count FROM logs GROUP BY source ORDER BY count DESC LIMIT 8"
    ).fetchall()

    # Logs by severity over last 24h (for trend chart)
    severity_timeline = conn.execute("""
        SELECT to_char(date_trunc('hour', timestamp), 'HH24:00') as hour,
               severity,
               COUNT(*) as count
        FROM logs
        WHERE timestamp >= NOW() - INTERVAL '24 hours'
        GROUP BY date_trunc('hour', timestamp), severity
        ORDER BY date_trunc('hour', timestamp)
    """).fetchall()

    conn.close()

    coverage = round((detected_techniques / total_techniques * 100), 1) if total_techniques > 0 else 0

    # EPS: events in last 60 seconds divided by 60
    eps_conn = get_db()
    eps_row = eps_conn.execute(
        "SELECT COUNT(*) FROM logs WHERE timestamp >= NOW() - INTERVAL '60 seconds'"
    ).fetchone()
    eps_conn.close()
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


@app.delete("/api/logs/purge")
def purge_old_logs(days: int = Query(30, ge=1)):
    """Purge logs older than N days to manage database size."""
    conn = get_db()
    cursor = conn.execute(
        "DELETE FROM logs WHERE timestamp < CURRENT_TIMESTAMP + CAST(%s AS INTERVAL)",
        [f"-{days} days"]
    )
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    return {"status": "purged", "deleted": deleted, "retention_days": days}





class FeedRequest(BaseModel):
    name: str
    url: str
    type: str
    category: str
    schedule: str = "Daily at 00:00 AM"


# ─── TI ENRICHMENT ─────────────────────────────────────────────────────────────

@app.post("/api/ti/enrich")
def ti_enrich(payload: dict):
    """
    Look up one or more indicators against the local threat_indicators table.
    Input:  {"indicators": ["1.2.3.4", "evil.com", "abc123hash..."]}
    Output: {"hits": [{"indicator": "...", "type": "...", "feed_name": "...", "feed_id": "..."}]}
    """
    raw = payload.get("indicators", [])
    if not raw or not isinstance(raw, list):
        return {"hits": []}
    # Deduplicate and cap at 50
    iocs = list(dict.fromkeys(str(i).strip() for i in raw if i))[:50]
    if not iocs:
        return {"hits": []}
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            placeholders = ",".join(["%s"] * len(iocs))
            cursor.execute(
                f"""SELECT DISTINCT ti.indicator, ti.type, tf.name, tf.id
                    FROM threat_indicators ti
                    JOIN threat_feeds tf ON ti.feed_id = tf.id
                    WHERE ti.indicator IN ({placeholders})
                    ORDER BY tf.name""",
                iocs
            )
            rows = cursor.fetchall()
        hits = [{"indicator": r[0], "type": r[1], "feed_name": r[2], "feed_id": r[3]} for r in rows]
        return {"hits": hits}
    except Exception as e:
        return {"hits": [], "error": str(e)}


@app.get("/api/threat-feeds")
def get_threat_feeds():
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            # Try to add schedule column if missing -- rollback if it already exists
            # (PostgreSQL aborts the whole transaction on a failed DDL unless we rollback)
            try:
                cursor.execute("ALTER TABLE threat_feeds ADD COLUMN schedule TEXT DEFAULT 'Daily at 00:00 AM'")
                conn.commit()
            except Exception:
                conn.rollback()
            
            cursor.execute("SELECT id, name, url, type, category, status, last_updated, indicator_count, schedule FROM threat_feeds ORDER BY name")
            feeds = [{"id": r[0], "name": r[1], "url": r[2], "type": r[3], "category": r[4], "status": r[5], "last_updated": r[6], "indicator_count": r[7], "schedule": r[8] if r[8] else "Daily"} for r in cursor.fetchall()]
            return {"data": feeds}
    except Exception as e:
        return {"data": [], "error": str(e)}

@app.post("/api/threat-feeds")
def add_threat_feed(req: FeedRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        feed_id = str(uuid.uuid4())
        cursor.execute("INSERT INTO threat_feeds (id, name, url, type, category, status, indicator_count, schedule) VALUES (%s, %s, %s, %s, %s, 'Active', 0, %s)", (feed_id, req.name, req.url, req.type, req.category, req.schedule))
        conn.commit()
        return {"status": "success", "id": feed_id}

@app.get("/api/threat-feeds/{feed_id}/export")
def export_feed(feed_id: str):
    import io
    import csv
    from fastapi.responses import StreamingResponse
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM threat_feeds WHERE id = %s", (feed_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Feed not found")
        feed_name = row[0]
        
        cursor.execute(
            "SELECT type, indicator FROM threat_indicators WHERE feed_id = %s AND indicator != 'indicator' AND type != 'type'",
            (feed_id,)
        )
        rows = cursor.fetchall()
        
        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_ALL)
        writer.writerow(["IoC Type", "Indicator"])
        writer.writerows(rows)
        
        response = StreamingResponse(iter([output.getvalue()]), media_type="text/csv")
        response.headers["Content-Disposition"] = f"attachment; filename={feed_name.replace(' ', '_')}_indicators.csv"
        return response

@app.get("/api/threat-feeds/{feed_id}/indicators")
def get_feed_indicators(feed_id: str, all: bool = False):
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            limit_clause = "" if all else " LIMIT 100"
            cursor.execute(
                "SELECT id, type, indicator FROM threat_indicators WHERE feed_id = %s AND indicator != 'indicator' AND type != 'type' ORDER BY type, indicator" + limit_clause,
                (feed_id,)
            )
            indicators = [{"id": r[0], "type": r[1], "indicator": r[2]} for r in cursor.fetchall()]
            return {"data": indicators}
    except Exception as e:
        return {"data": [], "error": str(e)}

@app.delete("/api/threat-feeds/{feed_id}/indicators/{indicator_id}")
def delete_indicator(feed_id: str, indicator_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM threat_indicators WHERE id = %s AND feed_id = %s", (indicator_id, feed_id))
        cursor.execute("UPDATE threat_feeds SET indicator_count = (SELECT COUNT(*) FROM threat_indicators WHERE feed_id = %s) WHERE id = %s", (feed_id, feed_id))
        conn.commit()
        return {"status": "success"}

@app.post("/api/threat-feeds/{feed_id}/import")
async def import_feed_csv(feed_id: str, file: UploadFile = File(...)):
    import csv
    from io import StringIO
    import uuid as uuid_mod
    content = await file.read()
    text = content.decode("utf-8", errors="replace")
    reader = csv.DictReader(StringIO(text))
    with get_db() as conn:
        cursor = conn.cursor()
        count = 0
        for r in reader:
            clean_r = {k.strip(): v.strip() for k, v in r.items()}
            t = clean_r.get("IoC Type", clean_r.get("Indicator type", "Unknown"))
            ind = clean_r.get("Indicator", "")
            desc = clean_r.get("Description", "")
            # Skip dummy/header rows
            if not ind or ind.lower() in ("indicator", "") or t.lower() in ("type", "ioc type", "indicator type"):
                continue
            cursor.execute(
                "INSERT INTO threat_indicators (id, feed_id, type, indicator, description) VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                (str(uuid_mod.uuid4()), feed_id, t, ind, desc)
            )
            count += 1
        cursor.execute(
            "UPDATE threat_feeds SET indicator_count = (SELECT COUNT(*) FROM threat_indicators WHERE feed_id = %s) WHERE id = %s",
            (feed_id, feed_id)
        )
        conn.commit()
    return {"status": "success", "imported": count}

@app.post("/api/threat-feeds/{feed_id}/sync")
def sync_feed(feed_id: str):
    import urllib.request
    import csv
    from io import StringIO
    from datetime import datetime
    import uuid as _uuid

    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT url FROM threat_feeds WHERE id = %s", (feed_id,))
            row = cursor.fetchone()
            if not row:
                return {"status": "error", "message": "Feed not found"}

            url = row[0]

            try:
                # Detect OTX URLs: otx:// scheme, /pulses/<id>/, or /pulse/<id> web URL
                pulse_id = None
                if url.startswith("otx://"):
                    pulse_id = url[6:]
                else:
                    pulse_id = _extract_pulse_id(url)

                # Community feeds: route to dedicated sync functions
                if url.startswith("community://"):
                    slug = url[len("community://"):]
                    slug_map = {
                        "threatfox": sync_threatfox,
                        "urlhaus": sync_urlhaus,
                        "cisa-kev": sync_cisa_kev,
                        "abuseipdb": sync_abuseipdb,
                    }
                    fn = slug_map.get(slug)
                    if fn:
                        return fn()
                    return {"status": "error", "message": f"Unknown community feed: {slug}"}

                if pulse_id:
                    # Use stored OTX API key — never depend on expiring JWT tokens in the URL
                    otx_key = get_setting("OTX_API_KEY")
                    if not otx_key:
                        cursor.execute("UPDATE threat_feeds SET status = 'Error' WHERE id = %s", (feed_id,))
                        conn.commit()
                        return {"status": "error", "message": "OTX API key not configured. Go to Settings in Threat Intel and add your API key."}

                    pulse = _otx_get(f"/pulses/{pulse_id}", otx_key)
                    indicators = pulse.get("indicators", [])

                    cursor.execute("DELETE FROM threat_indicators WHERE feed_id = %s", (feed_id,))
                    count = 0
                    for ind in indicators:
                        t = ind.get("type", "Unknown")
                        v = ind.get("indicator", "")
                        d = ind.get("description", "")
                        if v:
                            cursor.execute(
                                "INSERT INTO threat_indicators (id, feed_id, type, indicator, description) VALUES (%s, %s, %s, %s, %s)",
                                (str(_uuid.uuid4()), feed_id, t, v, d)
                            )
                            count += 1

                    now = datetime.now().isoformat()
                    cursor.execute(
                        "UPDATE threat_feeds SET indicator_count = %s, last_updated = %s, status = 'Active', url = %s WHERE id = %s",
                        (count, now, f"otx://{pulse_id}", feed_id)
                    )
                    conn.commit()
                    return {"status": "success", "count": count, "last_updated": now}

                # Non-OTX feed: fetch CSV from URL
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                response = urllib.request.urlopen(req, timeout=30).read().decode('utf-8')

                f = StringIO(response)
                reader = csv.DictReader(f)

                cursor.execute("DELETE FROM threat_indicators WHERE feed_id = %s", (feed_id,))
                count = 0
                for r in reader:
                    clean_r = {k.strip().replace('"', ''): v.strip().replace('"', '') for k, v in r.items()}
                    t = clean_r.get('Indicator type', 'Unknown')
                    i = clean_r.get('Indicator', '')
                    d = clean_r.get('Description', '')
                    if i and i not in ('indicator', 'www.linkedin.com'):
                        cursor.execute(
                            "INSERT INTO threat_indicators (id, feed_id, type, indicator, description) VALUES (%s, %s, %s, %s, %s)",
                            (str(_uuid.uuid4()), feed_id, t, i, d)
                        )
                        count += 1

                now = datetime.now().isoformat()
                cursor.execute(
                    "UPDATE threat_feeds SET indicator_count = %s, last_updated = %s, status = 'Active' WHERE id = %s",
                    (count, now, feed_id)
                )
                conn.commit()
                return {"status": "success", "count": count, "last_updated": now}

            except Exception as e:
                try:
                    conn.rollback()
                    cursor.execute("UPDATE threat_feeds SET status = 'Error' WHERE id = %s", (feed_id,))
                    conn.commit()
                except Exception:
                    pass
                return {"status": "error", "message": str(e)}

    except Exception as e:
        return {"status": "error", "message": f"Database error: {str(e)}"}

@app.delete("/api/threat-feeds/{feed_id}")
def delete_feed(feed_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM threat_feeds WHERE id = %s", (feed_id,))
        cursor.execute("DELETE FROM threat_indicators WHERE feed_id = %s", (feed_id,))
        conn.commit()
        return {"status": "success"}

@app.put("/api/threat-feeds/{feed_id}")
def update_feed(feed_id: str, req: FeedRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE threat_feeds SET name = %s, url = %s, type = %s, category = %s, schedule = %s WHERE id = %s", (req.name, req.url, req.type, req.category, req.schedule, feed_id))
        conn.commit()
        return {"status": "success"}

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/auth/login")
def login(req: LoginRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role, status, real_name, mfa_secret FROM users WHERE username ILIKE %s AND password = %s", (req.username, req.password))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user["status"] != 'Active':
        raise HTTPException(status_code=403, detail="Account disabled")
        
    user_dict = dict(user)
    mfa_secret = user_dict.pop("mfa_secret", None)
    user_dict["mfa_enabled"] = bool(mfa_secret)
    if mfa_secret:
        return {"status": "mfa_required", "user_id": user_dict["id"]}
    return {"status": "success", "user": user_dict}

class MFALoginRequest(BaseModel):
    user_id: str
    code: str

@app.post("/api/auth/login/mfa")
def login_mfa(req: MFALoginRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role, status, real_name, mfa_secret FROM users WHERE id = %s", (req.user_id,))
    user = cursor.fetchone()
    conn.close()
    
    if user and user["mfa_secret"]:
        totp = pyotp.TOTP(user["mfa_secret"])
        if totp.verify(req.code):
            user_dict = dict(user)
            user_dict.pop("mfa_secret", None)
            user_dict["mfa_enabled"] = True
            return {"status": "success", "user": user_dict}
        else:
            raise HTTPException(status_code=401, detail="Invalid MFA code")
    raise HTTPException(status_code=401, detail="User not found or MFA not enabled")

class MFASetupRequest(BaseModel):
    user_id: str

@app.post("/api/auth/mfa/setup")
def mfa_setup(req: MFASetupRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT username FROM users WHERE id = %s", (req.user_id,))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=user["username"], issuer_name="SOC Dashboard")
    
    return {"status": "success", "secret": secret, "uri": uri}

class MFAVerifyRequest(BaseModel):
    user_id: str
    secret: str
    code: str

@app.post("/api/auth/mfa/verify")
def mfa_verify(req: MFAVerifyRequest):
    totp = pyotp.TOTP(req.secret)
    if totp.verify(req.code):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET mfa_secret = %s WHERE id = %s", (req.secret, req.user_id))
        conn.commit()
        conn.close()
        return {"status": "success"}
    raise HTTPException(status_code=400, detail="Invalid verification code")


class UserCreate(BaseModel):
    username: str
    password: str
    role: str
    real_name: str = ""

class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    real_name: Optional[str] = None

@app.get("/api/users")
def get_users():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role, status, real_name FROM users")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "username": r[1], "role": r[2], "status": r[3], "real_name": r[4] or r[1]} for r in rows]

@app.post("/api/users")
def create_user(user: UserCreate):
    conn = get_db()
    cursor = conn.cursor()
    try:
        user_id = str(uuid.uuid4())
        cursor.execute("INSERT INTO users (id, username, password, role, real_name) VALUES (%s, %s, %s, %s, %s)", 
                      (user_id, user.username, user.password, user.role, user.real_name))
        conn.commit()
        return {"id": user_id, "username": user.username, "role": user.role, "status": "Active", "real_name": user.real_name}
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=400, detail="Username already exists")
    finally:
        conn.close()

@app.patch("/api/users/{user_id}")
def update_user(user_id: str, user: UserUpdate):
    conn = get_db()
    cursor = conn.cursor()
    updates = []
    params = []
    if user.password:
        updates.append("password = %s")
        params.append(user.password)
    if user.role:
        updates.append("role = %s")
        params.append(user.role)
    if user.status:
        updates.append("status = %s")
        params.append(user.status)
    if user.real_name is not None:
        updates.append("real_name = %s")
        params.append(user.real_name)
        
    if updates:
        params.append(user_id)
        cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = %s", params)
        conn.commit()
    conn.close()
    return {"success": True}

@app.delete("/api/users/{user_id}")
def delete_user(user_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
    conn.commit()
    conn.close()
    return {"success": True}


@app.get("/api/threat-intel/lookup")
def threat_lookup(ioc: str, ioc_type: str, provider: str = "VirusTotal"):
    try:
        if provider == "VirusTotal":
            vt_key = get_setting("VIRUSTOTAL_API_KEY")
            if not vt_key:
                return {"status": "error", "message": "VirusTotal API key not configured"}
            
            headers = {"x-apikey": vt_key}
            if ioc_type.lower() == "ip":
                url = f"https://www.virustotal.com/api/v3/ip_addresses/{ioc}"
            elif ioc_type.lower() in ["hash", "file", "filehash-sha256", "filehash-md5", "filehash-sha1"]:
                url = f"https://www.virustotal.com/api/v3/files/{ioc}"
            elif ioc_type.lower() in ["domain", "url"]:
                url = f"https://www.virustotal.com/api/v3/domains/{ioc}"
            else:
                return {"status": "error", "message": "Invalid IoC type"}
                
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                data = response.json()
                # Parse VT response format
                attrs = data.get("data", {}).get("attributes", {})
                return {
                    "status": "success", 
                    "provider": "VirusTotal",
                    "data": {
                        "reputation": attrs.get("reputation", 0),
                        "owner": attrs.get("as_owner", ""),
                        "country": attrs.get("country", ""),
                        "name": attrs.get("meaningful_name", ""),
                        "stats": attrs.get("last_analysis_stats", {})
                    }
                }
            elif response.status_code == 404:
                return {"status": "error", "message": "IoC not found in VirusTotal"}
            else:
                return {"status": "error", "message": f"VirusTotal API error: {response.status_code}"}
                
        elif provider == "IBM X-Force":
            xforce_key = get_setting("IBM_XFORCE_KEY")
            xforce_pass = get_setting("IBM_XFORCE_PASS")
            
            if not xforce_key or not xforce_pass:
                return {"status": "error", "message": "IBM X-Force API credentials not configured"}
                
            import base64
            auth = base64.b64encode(f"{xforce_key}:{xforce_pass}".encode()).decode()
            headers = {"Authorization": f"Basic {auth}", "Accept": "application/json"}
            
            if ioc_type.lower() == "ip":
                url = f"https://api.xforce.ibmcloud.com/ipr/{ioc}"
            elif ioc_type.lower() in ["hash", "file"]:
                url = f"https://api.xforce.ibmcloud.com/malware/{ioc}"
            else:
                url = f"https://api.xforce.ibmcloud.com/url/{ioc}"
                
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                data = response.json()
                # Try to extract risk score (1-10)
                risk = data.get("score", 0) if ioc_type.lower() == "ip" else data.get("risk", {}).get("score", 0)
                cats = data.get("cats", {}) if ioc_type.lower() == "ip" else data.get("result", {}).get("cats", {})
                
                # Format to a standard output
                return {
                    "status": "success",
                    "provider": "IBM X-Force",
                    "data": {
                        "reputation": risk, # 1-10
                        "owner": data.get("company", ""),
                        "country": data.get("geo", {}).get("country", ""),
                        "name": str(cats) if cats else "Unknown",
                        "stats": {
                            "malicious": 1 if risk > 7 else 0,
                            "suspicious": 1 if risk >= 4 and risk <= 7 else 0,
                            "harmless": 1 if risk < 4 else 0,
                            "undetected": 0
                        }
                    }
                }
            elif response.status_code == 404:
                return {"status": "error", "message": "IoC not found in IBM X-Force"}
            elif response.status_code == 401:
                return {"status": "error", "message": "IBM X-Force Authentication Failed"}
            else:
                return {"status": "error", "message": f"IBM X-Force API error: {response.status_code}"}
                
        elif provider == "Cisco Talos":
            talos_key = get_setting("CISCO_TALOS_KEY")
            if not talos_key:
                return {"status": "error", "message": "Cisco Talos API key not configured"}
            # Mocking Cisco Talos since their API usually requires enterprise CTR/SecureX integration
            return {
                "status": "success",
                "provider": "Cisco Talos",
                "data": {
                    "reputation": -5,
                    "owner": "Simulated Cisco Talos Result",
                    "country": "US",
                    "name": "Threat Category: Botnet",
                    "stats": {
                        "malicious": 1,
                        "suspicious": 0,
                        "harmless": 0,
                        "undetected": 0
                    }
                }
            }
        elif provider == "AbuseIPDB":
            abuseipdb_key = get_setting("ABUSEIPDB_API_KEY")
            if not abuseipdb_key:
                return {"status": "error", "message": "AbuseIPDB API key not configured"}
            if ioc_type.lower() not in ["ip"]:
                return {"status": "error", "message": "AbuseIPDB only supports IP lookups"}
            headers = {"Key": abuseipdb_key, "Accept": "application/json"}
            response = requests.get(
                f"https://api.abuseipdb.com/api/v2/check",
                headers=headers,
                params={"ipAddress": ioc, "maxAgeInDays": 90, "verbose": True},
                timeout=15
            )
            if response.status_code == 200:
                d = response.json().get("data", {})
                score = d.get("abuseConfidenceScore", 0)
                return {
                    "status": "success",
                    "provider": "AbuseIPDB",
                    "data": {
                        "reputation": score,
                        "owner": d.get("isp", ""),
                        "country": d.get("countryCode", ""),
                        "name": d.get("domain", "") or d.get("hostnames", [""])[0] if d.get("hostnames") else "",
                        "stats": {
                            "malicious": 1 if score >= 75 else 0,
                            "suspicious": 1 if 25 <= score < 75 else 0,
                            "harmless": 1 if score < 25 else 0,
                            "undetected": 0
                        },
                        "extra": {
                            "abuse_score": f"{score}% confidence",
                            "total_reports": d.get("totalReports", 0),
                            "last_reported": d.get("lastReportedAt", "Never"),
                            "is_tor": d.get("isTor", False),
                            "usage_type": d.get("usageType", ""),
                        }
                    }
                }
            elif response.status_code == 422:
                return {"status": "error", "message": "Invalid IP address"}
            elif response.status_code == 401:
                return {"status": "error", "message": "AbuseIPDB: Invalid API key"}
            else:
                return {"status": "error", "message": f"AbuseIPDB API error: {response.status_code}"}

        elif provider == "ThreatFox":
            # ThreatFox (abuse.ch) — no API key needed for lookups
            payload_map = {
                "ip": {"query": "search_ioc", "search_term": ioc},
                "hash": {"query": "search_hash", "hash": ioc},
                "domain": {"query": "search_ioc", "search_term": ioc},
                "url": {"query": "search_ioc", "search_term": ioc},
            }
            norm = ioc_type.lower()
            if norm in ["filehash-md5", "filehash-sha256", "filehash-sha1"]:
                norm = "hash"
            tf_payload = payload_map.get(norm, {"query": "search_ioc", "search_term": ioc})
            response = requests.post(
                "https://threatfox-api.abuse.ch/api/v1/",
                json=tf_payload,
                headers={"Content-Type": "application/json"},
                timeout=15
            )
            if response.status_code == 200:
                d = response.json()
                if d.get("query_status") in ["no_result", "no_results"]:
                    return {"status": "error", "message": "IOC not found in ThreatFox"}
                iocs = d.get("data", [])
                if not iocs:
                    return {"status": "error", "message": "IOC not found in ThreatFox"}
                first = iocs[0]
                malware = first.get("malware_printable", first.get("malware", "Unknown"))
                confidence = first.get("confidence_level", 0)
                threat_type = first.get("threat_type", "")
                tags = first.get("tags") or []
                return {
                    "status": "success",
                    "provider": "ThreatFox",
                    "data": {
                        "reputation": confidence,
                        "owner": malware,
                        "country": "",
                        "name": threat_type,
                        "stats": {
                            "malicious": 1 if confidence >= 50 else 0,
                            "suspicious": 1 if 20 <= confidence < 50 else 0,
                            "harmless": 0,
                            "undetected": 0
                        },
                        "extra": {
                            "malware_family": malware,
                            "threat_type": threat_type,
                            "confidence": f"{confidence}%",
                            "tags": ", ".join(tags) if tags else "—",
                            "first_seen": first.get("first_seen", ""),
                            "last_seen": first.get("last_seen", ""),
                            "reporter": first.get("reporter", ""),
                        }
                    }
                }
            else:
                return {"status": "error", "message": f"ThreatFox API error: {response.status_code}"}

        elif provider == "URLhaus":
            # URLhaus (abuse.ch) — no API key needed
            if ioc_type.lower() not in ["domain", "url", "ip"]:
                return {"status": "error", "message": "URLhaus supports URL, domain, and IP lookups"}
            if ioc_type.lower() in ["domain", "ip"]:
                uh_payload = {"host": ioc}
            else:
                uh_payload = {"url": ioc}
            response = requests.post(
                "https://urlhaus-api.abuse.ch/v1/host/" if ioc_type.lower() in ["domain","ip"] else "https://urlhaus-api.abuse.ch/v1/url/",
                data=uh_payload,
                timeout=15
            )
            if response.status_code == 200:
                d = response.json()
                if d.get("query_status") == "no_results":
                    return {"status": "error", "message": "Not found in URLhaus — likely clean"}
                urls = d.get("urls", [])
                online_count = sum(1 for u in urls if u.get("url_status") == "online")
                tags_all = []
                for u in urls[:10]:
                    tags_all.extend(u.get("tags") or [])
                unique_tags = list(dict.fromkeys(tags_all))[:8]
                return {
                    "status": "success",
                    "provider": "URLhaus",
                    "data": {
                        "reputation": min(100, len(urls) * 5),
                        "owner": d.get("blacklists", {}).get("spamhaus_dbl", ""),
                        "country": "",
                        "name": d.get("host", ioc),
                        "stats": {
                            "malicious": online_count,
                            "suspicious": len(urls) - online_count,
                            "harmless": 0,
                            "undetected": 0
                        },
                        "extra": {
                            "total_urls": len(urls),
                            "online_now": online_count,
                            "offline": len(urls) - online_count,
                            "tags": ", ".join(unique_tags) if unique_tags else "—",
                            "spamhaus_dbl": d.get("blacklists", {}).get("spamhaus_dbl", "not listed"),
                            "surbl": d.get("blacklists", {}).get("surbl", "not listed"),
                        }
                    }
                }
            else:
                return {"status": "error", "message": f"URLhaus API error: {response.status_code}"}

        else:
            return {"status": "error", "message": "Unknown provider"}
            
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# Community Feed Import/Sync Endpoints
# ThreatFox, URLhaus, CISA KEV, AbuseIPDB
# ─────────────────────────────────────────────────────────────────────────────

def _upsert_feed_and_indicators(feed_name: str, feed_url: str, category: str, source_tag: str, indicators: list):
    """
    Upsert a community feed row and bulk-replace its indicators.
    indicators: list of {"type": str, "indicator": str}
    Returns the feed_id.
    """
    import uuid
    with get_db() as conn:
        cursor = conn.cursor()
        # Upsert feed row
        cursor.execute("SELECT id FROM threat_feeds WHERE url = %s", (feed_url,))
        row = cursor.fetchone()
        if row:
            feed_id = row[0]
            cursor.execute(
                "UPDATE threat_feeds SET last_updated = %s, status = 'Active', indicator_count = %s WHERE id = %s",
                (datetime.now().isoformat(), len(indicators), feed_id)
            )
        else:
            feed_id = str(uuid.uuid4())
            cursor.execute(
                """INSERT INTO threat_feeds (id, name, url, type, category, status, indicator_count, schedule, last_updated)
                   VALUES (%s, %s, %s, 'Community', %s, 'Active', %s, 'Daily at 06:00', %s)""",
                (feed_id, feed_name, feed_url, category, len(indicators), datetime.now().isoformat())
            )
        # Replace indicators
        cursor.execute("DELETE FROM threat_indicators WHERE feed_id = %s", (feed_id,))
        if indicators:
            # batch insert 500 at a time
            batch = []
            for ioc in indicators:
                batch.append((str(uuid.uuid4()), feed_id, ioc.get("type","Unknown"), ioc.get("indicator",""), ""))
                if len(batch) >= 500:
                    cursor.executemany(
                        "INSERT INTO threat_indicators (id, feed_id, type, indicator, description) VALUES (%s, %s, %s, %s, %s)",
                        batch
                    )
                    batch = []
            if batch:
                cursor.executemany(
                    "INSERT INTO threat_indicators (id, feed_id, type, indicator, description) VALUES (%s, %s, %s, %s, %s)",
                    batch
                )
        conn.commit()
    return feed_id


@app.post("/api/community-feeds/threatfox/sync")
def sync_threatfox():
    """Import/sync ThreatFox (abuse.ch) IOCs.
    Uses the free CSV export (no key needed) or the API if THREATFOX_API_KEY is configured.
    """
    try:
        key = get_setting("THREATFOX_API_KEY")
        indicators = []

        if key:
            # Use the authenticated API for recent IOCs (last 7 days)
            resp = requests.post(
                "https://threatfox-api.abuse.ch/api/v1/",
                json={"query": "get_iocs", "days": 7},
                headers={"Content-Type": "application/json", "Auth-Key": key},
                timeout=45
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("query_status") != "ok":
                return {"status": "error", "message": data.get("query_status", "ThreatFox API error")}
            raw = data.get("data", []) or []
            for item in raw:
                ioc_val = item.get("ioc_value", item.get("ioc", ""))
                ioc_type = item.get("ioc_type_desc", item.get("ioc_type", "Unknown"))
                if ioc_val:
                    indicators.append({"type": ioc_type, "indicator": ioc_val})
        else:
            # Fall back to free CSV export (full dataset, updated daily)
            # https://threatfox.abuse.ch/export/csv/recent/
            resp = requests.get(
                "https://threatfox.abuse.ch/export/csv/recent/",
                timeout=60,
                headers={"User-Agent": "SOC-Dashboard/1.0"}
            )
            resp.raise_for_status()
            import csv, io
            reader = csv.reader(io.StringIO(resp.text))
            # Actual columns: first_seen_utc, ioc_id, ioc_value, ioc_type, threat_type,
            #                  fk_malware, malware_alias, malware_printable, last_seen_utc,
            #                  confidence_level, is_compromised, reference, tags, anonymous, reporter
            for row in reader:
                # Skip comment lines and header
                if not row or row[0].startswith("#") or "ioc_value" in row[0]:
                    continue
                # Strip whitespace and quotes from each cell
                row = [c.strip().strip('"') for c in row]
                if len(row) < 4:
                    continue
                ioc_val  = row[2] if len(row) > 2 else ""
                ioc_type = row[3] if len(row) > 3 else "Unknown"
                if ioc_val and ioc_val not in ("#", ""):
                    indicators.append({"type": ioc_type, "indicator": ioc_val})

        feed_id = _upsert_feed_and_indicators(
            feed_name="ThreatFox — Recent IOCs",
            feed_url="community://threatfox",
            category="Malware IOCs",
            source_tag="threatfox",
            indicators=indicators
        )
        return {"status": "success", "feed_id": feed_id, "count": len(indicators)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/community-feeds/urlhaus/sync")
def sync_urlhaus():
    """Import/sync URLhaus (abuse.ch) recent malicious URLs — no API key required."""
    try:
        resp = requests.get("https://urlhaus.abuse.ch/downloads/csv_recent/", timeout=30)
        resp.raise_for_status()
        lines = resp.text.splitlines()
        indicators = []
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # CSV columns: id,dateadded,url,url_status,last_online,threat,tags,urlhaus_link,reporter
            parts = line.split(",")
            if len(parts) >= 3:
                url_val = parts[2].strip().strip('"')
                status = parts[3].strip().strip('"') if len(parts) > 3 else ""
                threat = parts[5].strip().strip('"') if len(parts) > 5 else "Malicious URL"
                if url_val.startswith("http"):
                    indicators.append({"type": threat or "Malicious URL", "indicator": url_val})
        feed_id = _upsert_feed_and_indicators(
            feed_name="URLhaus — Recent Malicious URLs",
            feed_url="community://urlhaus",
            category="Malicious URLs",
            source_tag="urlhaus",
            indicators=indicators
        )
        return {"status": "success", "feed_id": feed_id, "count": len(indicators)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/community-feeds/cisa-kev/sync")
def sync_cisa_kev():
    """Import/sync CISA Known Exploited Vulnerabilities — no API key required."""
    try:
        resp = requests.get(
            "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
            timeout=30
        )
        resp.raise_for_status()
        data = resp.json()
        vulns = data.get("vulnerabilities", [])
        indicators = []
        for v in vulns:
            cve = v.get("cveID", "")
            product = v.get("product", "")
            vendor = v.get("vendorProject", "")
            label = f"{vendor} {product}".strip() if (vendor or product) else cve
            if cve:
                indicators.append({"type": "CVE", "indicator": cve})
        feed_id = _upsert_feed_and_indicators(
            feed_name="CISA KEV — Known Exploited Vulnerabilities",
            feed_url="community://cisa-kev",
            category="CVEs",
            source_tag="cisa-kev",
            indicators=indicators
        )
        return {"status": "success", "feed_id": feed_id, "count": len(indicators)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/community-feeds/abuseipdb/sync")
def sync_abuseipdb():
    """Import AbuseIPDB blocklist (top 10k IPs). Requires ABUSEIPDB_API_KEY."""
    key = get_setting("ABUSEIPDB_API_KEY")
    if not key:
        return {"status": "error", "message": "ABUSEIPDB_API_KEY not configured. Add it in Settings."}
    try:
        resp = requests.get(
            "https://api.abuseipdb.com/api/v2/blacklist",
            headers={"Key": key, "Accept": "application/json"},
            params={"confidenceMinimum": 90, "limit": 10000},
            timeout=30
        )
        if resp.status_code == 401:
            return {"status": "error", "message": "AbuseIPDB: Invalid API key"}
        resp.raise_for_status()
        data = resp.json()
        entries = data.get("data", [])
        indicators = [
            {"type": "IPv4", "indicator": e.get("ipAddress", "")}
            for e in entries if e.get("ipAddress")
        ]
        feed_id = _upsert_feed_and_indicators(
            feed_name="AbuseIPDB — High-Confidence Blocklist",
            feed_url="community://abuseipdb",
            category="Malicious IPs",
            source_tag="abuseipdb",
            indicators=indicators
        )
        return {"status": "success", "feed_id": feed_id, "count": len(indicators)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/community-feeds/status")
def community_feeds_status():
    """Return import status and last sync time for all community feeds."""
    sources = {
        "threatfox":  ("ThreatFox — Recent IOCs (7d)",            "community://threatfox",  False),
        "urlhaus":    ("URLhaus — Recent Malicious URLs",          "community://urlhaus",    False),
        "cisa-kev":   ("CISA KEV — Known Exploited Vulnerabilities","community://cisa-kev",  False),
        "abuseipdb":  ("AbuseIPDB — High-Confidence Blocklist",    "community://abuseipdb",  True),
    }
    result = {}
    with get_db() as conn:
        cursor = conn.cursor()
        for slug, (name, url, needs_key) in sources.items():
            cursor.execute(
                "SELECT id, status, indicator_count, last_updated FROM threat_feeds WHERE url = %s",
                (url,)
            )
            row = cursor.fetchone()
            if row:
                result[slug] = {
                    "imported": True,
                    "feed_id": row[0],
                    "status": row[1],
                    "indicator_count": row[2],
                    "last_updated": row[3],
                    "needs_key": needs_key,
                    "name": name,
                }
            else:
                result[slug] = {
                    "imported": False,
                    "needs_key": needs_key,
                    "name": name,
                }
    # Check AbuseIPDB key configured
    abuseipdb_configured = bool(get_setting("ABUSEIPDB_API_KEY"))
    result["abuseipdb"]["key_configured"] = abuseipdb_configured
    return {"status": "success", "data": result}


@app.get("/api/settings")
def get_settings():
    import os
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM settings")
        rows = cursor.fetchall()
        settings = {k: v for k, v in rows}
        
        # Merge with env if not in db
        if "VIRUSTOTAL_API_KEY" not in settings and os.environ.get("VIRUSTOTAL_API_KEY"):
            settings["VIRUSTOTAL_API_KEY"] = os.environ.get("VIRUSTOTAL_API_KEY")
        
        # Mask keys for frontend
        masked = {}
        for k, v in settings.items():
            if v and len(v) > 8:
                masked[k] = v[:4] + "*" * (len(v) - 8) + v[-4:]
            elif v:
                masked[k] = "***"
            else:
                masked[k] = ""
        return {"status": "success", "data": masked}


@app.post("/api/settings")
def save_settings(payload: dict):
    ALLOWED_KEYS = {
        "OTX_API_KEY", "VIRUSTOTAL_API_KEY", "IBM_XFORCE_KEY", "IBM_XFORCE_PASS",
        "TALOS_API_KEY", "ABUSEIPDB_API_KEY", "CISCO_TALOS_KEY", "THREATFOX_API_KEY"
    }
    with get_db() as conn:
        cursor = conn.cursor()
        for k, v in payload.items():
            if k not in ALLOWED_KEYS:
                continue  # reject unknown keys
            if v and "*" not in v:  # only save real values, not masked placeholders
                cursor.execute(
                    "INSERT INTO settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                    (k, v)
                )
        conn.commit()
        # Clean up garbage rows
        cursor.execute(
            "DELETE FROM settings WHERE key NOT IN ('OTX_API_KEY','VIRUSTOTAL_API_KEY','IBM_XFORCE_KEY','IBM_XFORCE_PASS','TALOS_API_KEY','ABUSEIPDB_API_KEY','CISCO_TALOS_KEY','THREATFOX_API_KEY')"
        )
        conn.commit()
        return {"status": "success"}

def get_setting(key, default=""):
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = %s", (key,))
            row = cursor.fetchone()
            if row:
                return row[0]
    except Exception:
        pass
    import os
    return os.environ.get(key, default)

class MFAResetRequest(BaseModel):
    user_id: str

@app.post("/api/auth/mfa/reset")
def mfa_reset(req: MFAResetRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET mfa_secret = NULL WHERE id = %s", (req.user_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

class ApiSourceCreate(BaseModel):
    type: str
    name: str
    config: str # JSON string

@app.get("/api/api-sources")
def get_api_sources():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, type, name, config, status, created_at FROM api_sources")
    rows = cursor.fetchall()
    return [{"id": r[0], "type": r[1], "name": r[2], "config": r[3], "status": r[4], "created_at": r[5]} for r in rows]

@app.post("/api/api-sources")
def create_api_source(source: ApiSourceCreate):
    conn = get_db()
    cursor = conn.cursor()
    source_id = str(uuid.uuid4())
    cursor.execute("INSERT INTO api_sources (id, type, name, config) VALUES (%s, %s, %s, %s)",
                  (source_id, source.type, source.name, source.config))
    conn.commit()
    return {"status": "success", "id": source_id}

@app.delete("/api/api-sources/{source_id}")
def delete_api_source(source_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM api_sources WHERE id = %s", (source_id,))
    conn.commit()
    return {"status": "success"}


class ReferenceSetBulkRequest(BaseModel):
    items: list[str]
    added_by: str = "Administrator"

@app.post("/api/reference-sets/{set_id}/bulk-items")
def add_reference_set_bulk(set_id: str, req: ReferenceSetBulkRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        
        batch = []
        for val in req.items:
            batch.append((str(uuid.uuid4()), set_id, val.strip(), req.added_by))
            
        cursor.executemany("INSERT INTO reference_set_items (id, set_id, value, added_by) VALUES (%s, %s, %s, %s)", batch)
        conn.commit()
        return {"status": "success", "count": len(batch)}


# ─── AlienVault OTX Integration ──────────────────────────────────────────────
# API key is stored in the settings table under key "OTX_API_KEY"
# Never hardcoded; user enters it in the Threat Intel settings modal

OTX_BASE = "https://otx.alienvault.com/api/v1"

def _otx_get(path: str, api_key: str, params: dict = None):
    """Make an authenticated GET request to the OTX API using requests library."""
    import requests as _req
    url = OTX_BASE + path
    headers = {"X-OTX-API-KEY": api_key, "User-Agent": "SOC-Dashboard/1.0"}
    # connect timeout 10s, read timeout 60s — OTX subscribed/search endpoints are slow
    resp = _req.get(url, headers=headers, params=params or {}, timeout=(10, 60))
    resp.raise_for_status()
    return resp.json()


def _extract_pulse_id(search_str: str) -> str:
    """Extract pulse ID from an OTX URL or return the string as-is if it's already an ID."""
    import re
    # Match /pulses/<id>/export (OTX API export URL) or /pulse/<id> (web UI URL)
    m = re.search(r'/pulses?/([a-f0-9]{24})', search_str)
    if m:
        return m.group(1)
    # Match raw 24-char hex ID
    if re.match(r'^[a-f0-9]{24}$', search_str.strip()):
        return search_str.strip()
    return None


@app.get("/api/otx/status")
def otx_status():
    """Check if OTX API key is configured and valid."""
    key = get_setting("OTX_API_KEY")
    if not key:
        return {"configured": False, "message": "OTX API key not set"}
    try:
        import requests as _req
        url = OTX_BASE + "/user/me"
        headers = {"X-OTX-API-KEY": key, "User-Agent": "SOC-Dashboard/1.0"}
        resp = _req.get(url, headers=headers, timeout=(5, 8))
        resp.raise_for_status()
        data = resp.json()
        return {"configured": True, "username": data.get("username"), "member_since": data.get("member_since")}
    except Exception as e:
        return {"configured": False, "message": str(e)}


@app.get("/api/otx/pulses")
def otx_list_pulses(page: int = 1, limit: int = 20, search: str = ""):
    """List pulses the user is subscribed to (or search all public pulses)."""
    import concurrent.futures
    key = get_setting("OTX_API_KEY")
    if not key:
        raise HTTPException(status_code=400, detail="OTX_API_KEY not configured. Add it in Threat Intel → Settings.")

    def _fetch():
        pulses = []
        search_stripped = (search or "").strip()

        # Direct URL or 24-char pulse ID — fetch immediately
        pulse_id = _extract_pulse_id(search_stripped) if search_stripped else None
        if pulse_id:
            try:
                p = _otx_get(f"/pulses/{pulse_id}", key)
                pulses = [p]
            except Exception:
                pulses = []
            return pulses

        # All other cases: fetch subscribed pulses, optionally filter by keyword
        try:
            params = {"limit": limit, "page": page}
            data = _otx_get("/pulses/subscribed", key, params)
            raw_pulses = data.get("results", [])
            if search_stripped:
                kw = search_stripped.lower()
                raw_pulses = [p for p in raw_pulses if kw in (p.get("name") or "").lower() or kw in (p.get("description") or "").lower() or kw in " ".join(p.get("tags") or []).lower()]
            pulses = raw_pulses
        except Exception as e:
            print(f"OTX subscribed fetch failed: {e}")
            # Fallback: return already-imported OTX feeds from local DB
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT id, name, url, indicator_count, status, last_updated FROM threat_feeds "
                    "WHERE url LIKE 'otx://%%' ORDER BY last_updated DESC LIMIT %s",
                    (limit,)
                )
                rows = cursor.fetchall()
            return [
                {
                    "id": r[2][6:] if r[2].startswith("otx://") else r[0],
                    "name": r[1],
                    "description": f"Imported — {r[3]} indicators · status: {r[4]}",
                    "author": "Imported",
                    "indicator_count": r[3] or 0,
                    "tags": [],
                    "created": r[5],
                    "modified": r[5],
                    "tlp": "WHITE",
                    "_local": True,
                }
                for r in rows
            ]
        return pulses

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            future = ex.submit(_fetch)
            pulses = future.result(timeout=90)  # 90s max for slow OTX endpoints
    except concurrent.futures.TimeoutError:
        raise HTTPException(status_code=504, detail="OTX API took too long to respond. Please try again.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    result = []
    for p in pulses:
        # OTX uses 'indicator_count' on pulse detail and 'indicators_count' on search results
        ind_count = (
            p.get("indicator_count")
            or p.get("indicators_count")
            or len(p.get("indicators", []))
            or 0
        )
        result.append({
            "id": p.get("id"),
            "name": p.get("name"),
            "description": p.get("description", ""),
            "author": p.get("author_name", ""),
            "indicator_count": ind_count,
            "tags": p.get("tags", [])[:6],  # cap tags for UI
            "created": p.get("created"),
            "modified": p.get("modified"),
            "tlp": p.get("tlp", "white").upper(),
        })
    return {"status": "success", "data": result, "count": len(result)}


@app.get("/api/otx/pulse/{pulse_id}")
def otx_get_pulse(pulse_id: str):
    """Get details and indicators for a specific OTX pulse."""
    key = get_setting("OTX_API_KEY")
    if not key:
        raise HTTPException(status_code=400, detail="OTX_API_KEY not configured.")
    try:
        data = _otx_get(f"/pulses/{pulse_id}", key)
        return {
            "status": "success",
            "id": data.get("id"),
            "name": data.get("name"),
            "description": data.get("description", ""),
            "indicator_count": data.get("indicator_count", 0),
            "indicators": [
                {"type": i.get("type"), "indicator": i.get("indicator"), "description": i.get("description", "")}
                for i in data.get("indicators", [])
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/otx/import/{pulse_id}")
def otx_import_pulse(pulse_id: str):
    """
    Import an OTX pulse as a threat feed.
    Phase 1: fetch pulse metadata quickly, create the feed row, return immediately.
    Phase 2: bulk-insert indicators in a background thread (avoids HTTP timeout on large pulses).
    """
    import threading
    key = get_setting("OTX_API_KEY")
    if not key:
        raise HTTPException(status_code=400, detail="OTX_API_KEY not configured.")

    feed_url = f"otx://{pulse_id}"

    # ── Phase 1: check duplicate + fetch metadata (fast call) ──────────────────
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM threat_feeds WHERE url = %s", (feed_url,))
            existing = cursor.fetchone()
            if existing:
                return {"status": "exists", "feed_id": existing[0], "message": "Pulse already imported"}

        # Fetch just the pulse header (no indicators yet) for name/category
        meta = _otx_get(f"/pulses/{pulse_id}", key)
        name = meta.get("name", f"OTX Pulse {pulse_id}")
        ind_count_hint = meta.get("indicator_count") or meta.get("indicators_count") or 0

        # Determine category from a quick pass over the first few indicators
        sample = meta.get("indicators", [])[:20]
        types_present = set(i.get("type", "") for i in sample)
        if "IPv4" in types_present or "IPv6" in types_present:
            category = "Malware IPs"
        elif "domain" in types_present or "hostname" in types_present:
            category = "Malicious Domains"
        elif "FileHash-MD5" in types_present or "FileHash-SHA256" in types_present:
            category = "Malware Hashes"
        elif "URL" in types_present:
            category = "Phishing URLs"
        else:
            category = "Mixed"

        feed_id = str(uuid.uuid4())
        now = datetime.now().isoformat()

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO threat_feeds (id, name, url, type, category, status, indicator_count, schedule, last_updated) "
                "VALUES (%s, %s, %s, 'OTX', %s, 'Importing', %s, 'Daily at 09:00 AM', %s)",
                (feed_id, name, feed_url, category, ind_count_hint, now)
            )
            conn.commit()

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # ── Phase 2: bulk-insert indicators in background ───────────────────────────
    def _do_import(fid: str, pid: str, api_key: str):
        try:
            # Fetch full pulse with all indicators (may be slow for large pulses)
            full = _otx_get(f"/pulses/{pid}", api_key)
            indicators = full.get("indicators", [])
            count = 0
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM threat_indicators WHERE feed_id = %s", (fid,))
                for ind in indicators:
                    t = ind.get("type", "Unknown")
                    v = ind.get("indicator", "")
                    d = ind.get("description", "")
                    if v:
                        cursor.execute(
                            "INSERT INTO threat_indicators (id, feed_id, type, indicator, description) VALUES (%s, %s, %s, %s, %s)",
                            (str(uuid.uuid4()), fid, t, v, d)
                        )
                        count += 1
                cursor.execute(
                    "UPDATE threat_feeds SET indicator_count = %s, status = 'Active', last_updated = %s WHERE id = %s",
                    (count, datetime.now().isoformat(), fid)
                )
                conn.commit()
        except Exception as bg_err:
            try:
                with get_db() as conn:
                    conn.cursor().execute(
                        "UPDATE threat_feeds SET status = 'Error' WHERE id = %s", (fid,)
                    )
                    conn.commit()
            except Exception:
                pass

    t = threading.Thread(target=_do_import, args=(feed_id, pulse_id, key), daemon=True)
    t.start()

    return {
        "status": "importing",
        "feed_id": feed_id,
        "name": name,
        "indicator_count_hint": ind_count_hint,
        "message": f"Import started — {ind_count_hint} indicators are being loaded in the background. Refresh in a few seconds."
    }


@app.post("/api/otx/sync/{feed_id}")
def otx_sync_feed(feed_id: str):
    """
    Re-sync an OTX feed using the stored API key + pulse ID from the otx:// URL.
    This replaces the old JWT-URL approach that expired.
    """
    key = get_setting("OTX_API_KEY")
    if not key:
        raise HTTPException(status_code=400, detail="OTX_API_KEY not configured.")
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT url, name FROM threat_feeds WHERE id = %s", (feed_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Feed not found")
            feed_url, feed_name = row
            if not feed_url.startswith("otx://"):
                raise HTTPException(status_code=400, detail="Not an OTX-managed feed. Use the regular sync endpoint.")

            pulse_id = feed_url[6:]  # strip "otx://"
            pulse = _otx_get(f"/pulses/{pulse_id}", key)
            indicators = pulse.get("indicators", [])

            cursor.execute("DELETE FROM threat_indicators WHERE feed_id = %s", (feed_id,))
            count = 0
            for ind in indicators:
                t = ind.get("type", "Unknown")
                v = ind.get("indicator", "")
                d = ind.get("description", "")
                if v:
                    cursor.execute(
                        "INSERT INTO threat_indicators (id, feed_id, type, indicator, description) VALUES (%s, %s, %s, %s, %s)",
                        (str(uuid.uuid4()), feed_id, t, v, d)
                    )
                    count += 1

            now = datetime.now().isoformat()
            cursor.execute(
                "UPDATE threat_feeds SET indicator_count = %s, last_updated = %s, status = 'Active' WHERE id = %s",
                (count, now, feed_id)
            )
            conn.commit()
        return {"status": "success", "count": count}
    except HTTPException:
        raise
    except Exception as e:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE threat_feeds SET status = 'Error' WHERE id = %s", (feed_id,))
            conn.commit()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/api-sources/{source_id}")
def delete_api_source(source_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM api_sources WHERE id = %s", (source_id,))
    conn.commit()
    return {"status": "success"}


# ─────────────────────────────────────────────────────────────────────────────
# SOAR Playbooks
# ─────────────────────────────────────────────────────────────────────────────

class PlaybookAction(BaseModel):
    type: str           # slack | teams | webhook | disable_ad_user | block_ip_windows | block_ip_pfsense | email
    name: str = ""
    webhook_url: str = ""
    domain: str = ""
    username: str = ""
    ip: str = ""
    pfsense_url: str = ""
    api_key: str = ""
    api_token: str = ""
    alias_name: str = "SOC_Blocked_IPs"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    to: str = ""

class PlaybookCreate(BaseModel):
    name: str
    description: str = ""
    enabled: bool = True
    trigger_severity: str = "critical"   # low | medium | high | critical
    trigger_keyword: str = ""
    actions: List[Dict] = []

class PlaybookUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    trigger_severity: Optional[str] = None
    trigger_keyword: Optional[str] = None
    actions: Optional[List[Dict]] = None


@app.get("/api/playbooks")
def get_playbooks():
    conn = get_db()
    cursor = conn.cursor()
    rows = cursor.execute(
        "SELECT id, name, description, enabled, trigger_severity, trigger_keyword, actions, created_at, updated_at FROM playbooks ORDER BY created_at DESC"
    ).fetchall()
    result = []
    for r in rows:
        try:
            actions = json.loads(r[6]) if r[6] else []
        except Exception:
            actions = []
        result.append({
            "id": r[0], "name": r[1], "description": r[2],
            "enabled": r[3], "trigger_severity": r[4], "trigger_keyword": r[5],
            "actions": actions, "created_at": r[7], "updated_at": r[8],
        })
    return result


@app.post("/api/playbooks")
def create_playbook(pb: PlaybookCreate):
    conn = get_db()
    cursor = conn.cursor()
    pb_id = str(uuid.uuid4())
    cursor.execute(
        """INSERT INTO playbooks (id, name, description, enabled, trigger_severity, trigger_keyword, actions)
           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (pb_id, pb.name, pb.description, pb.enabled,
         pb.trigger_severity, pb.trigger_keyword, json.dumps(pb.actions))
    )
    conn.commit()
    return {"status": "success", "id": pb_id}


@app.patch("/api/playbooks/{pb_id}")
def update_playbook(pb_id: str, pb: PlaybookUpdate):
    conn = get_db()
    cursor = conn.cursor()
    updates, params = [], []
    if pb.name is not None:
        updates.append("name = %s"); params.append(pb.name)
    if pb.description is not None:
        updates.append("description = %s"); params.append(pb.description)
    if pb.enabled is not None:
        updates.append("enabled = %s"); params.append(pb.enabled)
    if pb.trigger_severity is not None:
        updates.append("trigger_severity = %s"); params.append(pb.trigger_severity)
    if pb.trigger_keyword is not None:
        updates.append("trigger_keyword = %s"); params.append(pb.trigger_keyword)
    if pb.actions is not None:
        updates.append("actions = %s"); params.append(json.dumps(pb.actions))
    if not updates:
        return {"status": "no_change"}
    updates.append("updated_at = NOW()")
    params.append(pb_id)
    cursor.execute(f"UPDATE playbooks SET {', '.join(updates)} WHERE id = %s", params)
    conn.commit()
    return {"status": "success"}


@app.delete("/api/playbooks/{pb_id}")
def delete_playbook(pb_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM playbooks WHERE id = %s", (pb_id,))
    conn.commit()
    return {"status": "success"}


@app.post("/api/playbooks/{pb_id}/test")
def test_playbook(pb_id: str, alert_id: Optional[str] = None):
    """
    Manually fire a playbook against a real alert (or a synthetic test alert).
    """
    conn = get_db()
    cursor = conn.cursor()
    pb_row = cursor.execute(
        "SELECT id, name, description, enabled, trigger_severity, trigger_keyword, actions FROM playbooks WHERE id = %s",
        (pb_id,)
    ).fetchone()
    if not pb_row:
        raise HTTPException(status_code=404, detail="Playbook not found")

    pb_dict = {
        "id": pb_row[0], "name": pb_row[1], "description": pb_row[2],
        "enabled": True,  # force-enable for test
        "trigger_severity": pb_row[4], "trigger_keyword": pb_row[5],
        "actions": pb_row[6],
    }

    if alert_id:
        a = cursor.execute(
            "SELECT id, title, severity, source, timestamp, raw_log FROM alerts WHERE id = %s",
            (alert_id,)
        ).fetchone()
        alert_obj = {
            "id": a[0], "title": a[1], "severity": a[2],
            "source": a[3], "timestamp": str(a[4]), "raw_log": a[5] or "",
        } if a else None
    else:
        alert_obj = None

    if not alert_obj:
        alert_obj = {
            "id": "test-" + str(uuid.uuid4()),
            "title": f"[TEST] Manual trigger of playbook: {pb_row[1]}",
            "severity": pb_row[4],
            "source": "manual-test",
            "hostname": "DESKTOP-3BEJ849",
            "username": "TestUser",
            "src_ip": "203.0.113.42",
            "timestamp": datetime.utcnow().isoformat(),
            "description": "Manually triggered test execution",
            "raw_log": "",
        }

    exec_id = execute_playbook(pb_dict, alert_obj, conn)
    # Fetch result
    exec_row = cursor.execute(
        "SELECT id, status, results, triggered_at FROM playbook_executions WHERE id = %s",
        (exec_id,)
    ).fetchone()
    try:
        results = json.loads(exec_row[2]) if exec_row and exec_row[2] else []
    except Exception:
        results = []
    return {
        "execution_id": exec_id,
        "status": exec_row[1] if exec_row else "unknown",
        "results": results,
    }


@app.get("/api/playbooks/executions")
def get_executions(limit: int = Query(50, ge=1, le=200)):
    conn = get_db()
    cursor = conn.cursor()
    rows = cursor.execute(
        """SELECT pe.id, pe.playbook_id, p.name, pe.alert_id, pe.triggered_at,
                  pe.status, pe.results, pe.error
           FROM playbook_executions pe
           LEFT JOIN playbooks p ON pe.playbook_id = p.id
           ORDER BY pe.triggered_at DESC
           LIMIT %s""",
        (limit,)
    ).fetchall()
    result = []
    for r in rows:
        try:
            results_list = json.loads(r[6]) if r[6] else []
        except Exception:
            results_list = []
        result.append({
            "id": r[0], "playbook_id": r[1], "playbook_name": r[2],
            "alert_id": r[3], "triggered_at": str(r[4]) if r[4] else None,
            "status": r[5], "results": results_list, "error": r[7],
        })
    return result

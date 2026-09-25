"""
SOC Dashboard API with SQLite Database
=======================================
FastAPI backend with persistent SQLite storage for logs, alerts, and MITRE ATT&CK mappings.
Designed for Vercel serverless deployment and local uvicorn usage.
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime
import uuid
import sqlite3
import json
import re
import os

# ---------------------------------------------------------------------------
# Database setup
# ---------------------------------------------------------------------------

# Use /tmp for Vercel serverless (ephemeral), or local path for persistent storage
DB_PATH = os.environ.get("SOC_DB_PATH", os.path.join(os.path.dirname(__file__), "..", "soc_dashboard.db"))

def get_db() -> sqlite3.Connection:
    """Get a database connection with row factory for dict-like access."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")       # Better concurrent read performance
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    """Initialize database tables if they don't exist."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript("""
        -- Logs table: stores all ingested security events
        CREATE TABLE IF NOT EXISTS logs (
            id          TEXT PRIMARY KEY,
            timestamp   TEXT NOT NULL,
            source      TEXT NOT NULL,
            event_id    TEXT,
            severity    TEXT NOT NULL DEFAULT 'info',
            message     TEXT NOT NULL,
            hostname    TEXT NOT NULL,
            username    TEXT,
            raw_log     TEXT,
            extracted_fields TEXT,
            mitre_tactics    TEXT DEFAULT '[]',
            mitre_techniques TEXT DEFAULT '[]',
            created_at  TEXT DEFAULT (datetime('now'))
        );

        -- Alerts table: stores security alerts generated from log analysis
        CREATE TABLE IF NOT EXISTS alerts (
            id          TEXT PRIMARY KEY,
            timestamp   TEXT NOT NULL,
            title       TEXT NOT NULL,
            description TEXT,
            severity    TEXT NOT NULL DEFAULT 'medium',
            status      TEXT NOT NULL DEFAULT 'new',
            source      TEXT,
            event_id    TEXT,
            mitre_ref   TEXT,
            assigned_to TEXT,
            resolution_type TEXT,
            notes       TEXT,
            raw_log     TEXT,
            extracted_fields TEXT,
            created_at  TEXT DEFAULT (datetime('now')),
            updated_at  TEXT DEFAULT (datetime('now'))
        );

        -- Custom Log Parsers
        CREATE TABLE IF NOT EXISTS parsers (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            regex       TEXT NOT NULL,
            description TEXT,
            active      BOOLEAN DEFAULT 1
        );
        
        -- Custom Use Cases
        CREATE TABLE IF NOT EXISTS use_cases (
            id              TEXT PRIMARY KEY,
            title           TEXT NOT NULL,
            description     TEXT,
            type            TEXT NOT NULL,
            event_id        TEXT,
            mitre_technique TEXT,
            threshold_count INTEGER,
            rule_logic      TEXT,
            severity        TEXT NOT NULL,
            active          BOOLEAN DEFAULT 1
        );

        -- MITRE ATT&CK mappings: Event ID to tactic/technique mapping
        CREATE TABLE IF NOT EXISTS mitre_mappings (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id     TEXT NOT NULL,
            title        TEXT NOT NULL,
            description  TEXT,
            tactic       TEXT NOT NULL,
            tactic_id    TEXT NOT NULL,
            technique    TEXT NOT NULL,
            technique_id TEXT NOT NULL,
            severity     TEXT NOT NULL DEFAULT 'medium',
            platform     TEXT NOT NULL DEFAULT 'windows'
        );

        -- Indexes for fast queries
        CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_logs_severity ON logs(severity);
        CREATE INDEX IF NOT EXISTS idx_logs_event_id ON logs(event_id);
        CREATE INDEX IF NOT EXISTS idx_logs_hostname ON logs(hostname);
        CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
        CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
        CREATE INDEX IF NOT EXISTS idx_mitre_event_id ON mitre_mappings(event_id);
    """)

    # Safely attempt to add new columns to alerts if the table already existed
    try:
        conn.execute("ALTER TABLE alerts ADD COLUMN resolution_type TEXT")
    except sqlite3.OperationalError:
        pass
        
    try:
        conn.execute("ALTER TABLE alerts ADD COLUMN notes TEXT")
    except sqlite3.OperationalError:
        pass
        
    try:
        conn.execute("ALTER TABLE alerts ADD COLUMN raw_log TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE parsers ADD COLUMN log_source TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE alerts ADD COLUMN extracted_fields TEXT")
    except sqlite3.OperationalError:
        pass

    # Seed MITRE mappings if table is empty
    count = cursor.execute("SELECT COUNT(*) FROM mitre_mappings").fetchone()[0]
    if count == 0:
        _seed_mitre_mappings(cursor)

    # Seed Use Cases if table is empty
    count_p = cursor.execute("SELECT COUNT(*) FROM parsers").fetchone()[0]
    if count_p == 0:
        _seed_parsers(cursor)

    count_uc = cursor.execute("SELECT COUNT(*) FROM use_cases").fetchone()[0]
    if count_uc == 0:
        _seed_use_cases(cursor)

    conn.commit()
    conn.close()

def _seed_use_cases(cursor: sqlite3.Cursor):
    """Seed comprehensive generic detection rules for Windows and Linux."""
    seed_data = [
        # Windows Rules
        ("UC-W01", "Windows: Multiple Login Failures (Brute Force)", "Detects multiple failed logins (Event 4625).", "threshold", "4625", "T1110", 3, "high", 1),
        ("UC-W02", "Windows: Clear Audit Logs (Defense Evasion)", "Windows audit logs cleared (Event 1102).", "match", "1102", "T1070.001", None, "critical", 1),
        ("UC-W03", "Windows: New Service Creation (Persistence)", "A new service was installed in the system (Event 7045/4697).", "match", "4697", "T1543.003", None, "high", 1),
        ("UC-W04", "Windows: Scheduled Task Created", "A scheduled task was created (Event 4698).", "match", "4698", "T1053.005", None, "medium", 1),
        ("UC-W05", "Windows: User Account Created", "A new user account was created (Event 4720).", "match", "4720", "T1136.001", None, "low", 1),
        
        # Linux Rules
        ("UC-L01", "Linux: SSH Brute Force", "Multiple failed SSH logins.", "threshold", None, "T1110", 3, "high", 1),
        ("UC-L02", "Linux: Privilege Escalation Attempt", "Failed sudo or authentication failure.", "threshold", None, "T1078", 2, "high", 1),
        ("UC-L03", "Linux: Local Account Creation", "New user added via useradd.", "match", None, "T1136", None, "medium", 1),
        ("UC-L04", "Linux: Firewall Tampering", "iptables/ufw rules modified or disabled.", "match", None, "T1562.004", None, "critical", 1),
        ("UC-L05", "Linux: Suspicious Cron Job", "Cron job added for persistence.", "match", None, "T1053.003", None, "medium", 1),
        ("UC-L06", "Linux: Package Execution", "Use of apt/yum (potential suspicious install).", "match", None, "T1059", None, "info", 1)
    ]
    cursor.executemany("""
        INSERT INTO use_cases (id, title, description, type, event_id, mitre_technique, threshold_count, severity, active, rule_logic)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, seed_data)

def _seed_mitre_mappings(cursor: sqlite3.Cursor):
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
        "INSERT INTO mitre_mappings (event_id, title, description, tactic, tactic_id, technique, technique_id, severity, platform) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        mappings
    )

# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="SOC Dashboard API",
    description="Security Operations Center API with SQLite persistence and MITRE ATT&CK mapping",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database on startup
init_db()

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

@app.get("/api/health")
def health_check():
    """Health check with database status."""
    conn = get_db()
    log_count = conn.execute("SELECT COUNT(*) FROM logs").fetchone()[0]
    alert_count = conn.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
    conn.close()
    return {
        "status": "ok",
        "database": "sqlite",
        "db_path": DB_PATH,
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
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health_check():
    return {"status": "ok", "version": "1.0"}

@app.get("/api/sources")
def get_sources():
    """Return an aggregated list of reporting log sources and their health status."""
    conn = get_db()
    
    # Query to group by hostname to find the latest timestamp and event counts
    query = """
        SELECT 
            hostname, 
            GROUP_CONCAT(DISTINCT source) as sources, 
            MAX(timestamp) as last_seen,
            COUNT(*) as total_events
        FROM logs 
        GROUP BY hostname
        ORDER BY last_seen DESC
    """
    rows = conn.execute(query).fetchall()
    conn.close()
    
    sources_list = []
    now = datetime.now()
    
    for r in rows:
        last_seen_dt = datetime.fromisoformat(r["last_seen"].replace("Z", "+00:00"))
        # If the source reported within the last 15 minutes, consider it healthy
        is_healthy = (now - last_seen_dt.replace(tzinfo=None)).total_seconds() < 900
        
        sources_list.append({
            "hostname": r["hostname"],
            "source": r["sources"], # Kept as 'source' for frontend compatibility
            "lastSeen": r["last_seen"],
            "totalEvents": r["total_events"],
            "status": "healthy" if is_healthy else "inactive"
        })
        
    return sources_list

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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (uc_id, uc.title, uc.description, uc.type, uc.event_id, uc.mitre_technique, uc.threshold_count, uc.severity, uc.active, uc.rule_logic))
    conn.commit()
    conn.close()
    return {"id": uc_id, "status": "created"}

@app.delete("/api/usecases/{uc_id}")
def delete_usecase(uc_id: str):
    conn = get_db()
    conn.execute("DELETE FROM use_cases WHERE id = ?", (uc_id,))
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
        VALUES (?, ?, ?, ?, ?, ?)
    """, (parser_id, parser.name, parser.regex, parser.description, parser.active))
    conn.commit()
    conn.close()
    return {"id": parser_id, "status": "created"}

@app.delete("/api/parsers/{parser_id}")
def delete_parser(parser_id: str):
    conn = get_db()
    conn.execute("DELETE FROM parsers WHERE id = ?", (parser_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.post("/api/logs/ingest")
def ingest_logs(entries: List[LogEntry]):
    """Ingest logs from Windows HTTP collectors into SQLite."""
    conn = get_db()
    for entry in entries:
        process_log_entry(entry, conn)
    
    conn.commit()
    conn.close()
    return {"status": "ok", "ingested": len(entries)}

def process_log_entry(entry: LogEntry, conn):
    """Core logic to parse, evaluate use cases, and store a log entry."""
    cursor = conn.cursor()
    
    # Fetch active parsers
    active_parsers = conn.execute("SELECT name, regex FROM parsers WHERE active = 1").fetchall()

    import uuid, json, re
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
                match = re.search(parser["regex"], entry.message)
                if match:
                    raw_data["extracted_fields"].update(match.groupdict())
                    
            raw_log = json.dumps(raw_data)
        except Exception:
            pass 

    cursor.execute("""
        INSERT INTO logs (id, timestamp, source, event_id, severity, message, hostname, username, raw_log, mitre_tactics, mitre_techniques)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        log_id, entry.timestamp, entry.source, entry.event_id, entry.severity, 
        entry.message, entry.hostname, entry.username, raw_log, 
        mitre_tactics_json, mitre_techniques_json
    ))

    # Fetch Active Use Cases
    active_usecases = [dict(r) for r in conn.execute("SELECT * FROM use_cases WHERE active = 1").fetchall()]

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
                count = cursor.execute("""
                    SELECT COUNT(*) FROM logs 
                    WHERE hostname = ? AND mitre_techniques LIKE ?
                """, (entry.hostname, f'%"{uc["mitre_technique"]}"%')).fetchone()[0]
                
                if uc.get("threshold_count") and count >= uc["threshold_count"]:
                    recent_alert = cursor.execute("""
                        SELECT COUNT(*) FROM alerts WHERE title LIKE ? AND timestamp > datetime('now', '-5 minutes')
                    """, (f"%{uc['title']}%",)).fetchone()[0]
                    
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
        cursor.execute("""
            INSERT INTO alerts (id, timestamp, title, description, severity, status, source, event_id, mitre_ref, raw_log, extracted_fields)
            VALUES (?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?)
        """, (
            alert_id, entry.timestamp, alert_title, 
            f"Generated by SOC Detection Engine for {entry.hostname}. Details: {entry.message}",
            alert_sev, entry.source, entry.event_id, mitre_ref, raw_log, json.dumps(parsed_fields)
        ))

@app.get("/api/logs")
def get_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    severity: Optional[str] = None,
    search: Optional[str] = None,
    hostname: Optional[str] = None,
):
    """Retrieve stored logs with pagination and filtering."""
    conn = get_db()
    conditions = []
    params: list = []

    if severity and severity != "all":
        conditions.append("severity = ?")
        params.append(severity)
    if search:
        conditions.append("(message LIKE ? OR hostname LIKE ? OR event_id LIKE ?)")
        params.extend([f"%{search}%"] * 3)
    if hostname:
        conditions.append("hostname = ?")
        params.append(hostname)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    total = conn.execute(f"SELECT COUNT(*) FROM logs {where}", params).fetchone()[0]

    offset = (page - 1) * limit
    rows = conn.execute(
        f"SELECT * FROM logs {where} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
        params + [limit, offset]
    ).fetchall()

    conn.close()
    formatted_logs = []
    for r in rows:
        tactics = json.loads(r["mitre_tactics"]) if r["mitre_tactics"] else []
        techniques = json.loads(r["mitre_techniques"]) if r["mitre_techniques"] else []
        try:
            raw_log_obj = json.loads(r["raw_log"]) if (r["raw_log"] and r["raw_log"].startswith("{")) else r["raw_log"]
        except:
            raw_log_obj = r["raw_log"]

        raw_severity = r["severity"].lower()
        norm_severity = "medium" if raw_severity == "warning" else "high" if raw_severity == "error" else raw_severity

        formatted_logs.append({
            "id": r["id"],
            "timestamp": r["timestamp"],
            "source": r["source"],
            "eventId": r["event_id"],
            "severity": norm_severity,
            "message": r["message"],
            "hostname": r["hostname"],
            "username": r["username"],
            "rawLog": raw_log_obj,
            "mitreTactic": tactics[0] if tactics else None,
            "mitreTechnique": techniques[0] if techniques else None,
        })

    return {
        "data": formatted_logs,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


@app.get("/api/mitre/mappings")
def get_mitre_mappings(platform: Optional[str] = None):
    """Return MITRE ATT&CK event ID mappings from the database."""
    conn = get_db()
    if platform:
        rows = conn.execute("SELECT * FROM mitre_mappings WHERE platform = ? ORDER BY tactic_id", [platform]).fetchall()
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
        conditions.append("status = ?")
        params.append(status)
    if severity and severity != "all":
        conditions.append("severity = ?")
        params.append(severity)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    total = conn.execute(f"SELECT COUNT(*) FROM alerts {where}", params).fetchone()[0]

    offset = (page - 1) * limit
    rows = conn.execute(
        f"SELECT * FROM alerts {where} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
        params + [limit, offset]
    ).fetchall()

    conn.close()
    return {
        "data": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "limit": limit,
    }


@app.post("/api/alerts")
def create_alert(alert: AlertCreate):
    """Manually create an alert."""
    conn = get_db()
    alert_id = str(uuid.uuid4())
    conn.execute("""
        INSERT INTO alerts (id, timestamp, title, description, severity, status, source, event_id, mitre_ref, raw_log, extracted_fields)
        VALUES (?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?)
    """, (
        alert_id,
        datetime.now().isoformat(),
        alert.title,
        alert.description,
        alert.severity,
        alert.source,
        alert.event_id,
        alert.mitre_ref,
    ))
    conn.commit()
    conn.close()
    return {"id": alert_id, "status": "created"}


@app.patch("/api/alerts/{alert_id}")
def update_alert_status(alert_id: str, update: StatusUpdate):
    """Update the status of an alert and add investigation notes."""
    conn = get_db()
    
    # Dynamically build the update query
    fields = ["status = ?", "updated_at = datetime('now')"]
    params = [update.status]
    
    if update.resolution_type is not None:
        fields.append("resolution_type = ?")
        params.append(update.resolution_type)
        
    if update.notes is not None:
        fields.append("notes = ?")
        params.append(update.notes)
        
    params.append(alert_id)
    
    query = f"UPDATE alerts SET {', '.join(fields)} WHERE id = ?"
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

    # Logs by hour (last 24h)
    logs_by_hour = conn.execute("""
        SELECT strftime('%H:00', timestamp) as hour, COUNT(*) as count
        FROM logs
        WHERE timestamp >= datetime('now', '-24 hours')
        GROUP BY hour
        ORDER BY hour
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

    conn.close()

    coverage = round((detected_techniques / total_techniques * 100), 1) if total_techniques > 0 else 0

    return {
        "total_logs": total_logs,
        "total_alerts": total_alerts,
        "critical_alerts": critical_alerts,
        "new_alerts": new_alerts,
        "active_sources": active_sources,
        "mitre_coverage": coverage,
        "severity_distribution": [{"severity": r["severity"], "count": r["count"]} for r in severity_rows],
        "top_event_ids": [{"event_id": r["event_id"], "count": r["count"]} for r in top_events],
        "logs_by_hour": [{"hour": r["hour"], "count": r["count"]} for r in logs_by_hour],
        "detected_techniques": [{"technique_id": r["technique_id"], "severity": r["max_severity"], "count": r["hit_count"]} for r in detected_techniques_list],
    }


@app.delete("/api/logs/purge")
def purge_old_logs(days: int = Query(30, ge=1)):
    """Purge logs older than N days to manage database size."""
    conn = get_db()
    cursor = conn.execute(
        "DELETE FROM logs WHERE timestamp < datetime('now', ?)",
        [f"-{days} days"]
    )
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    return {"status": "purged", "deleted": deleted, "retention_days": days}

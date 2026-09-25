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
DB_PATH = os.environ.get("SOC_DB_PATH", "/tmp/soc_dashboard.db" if os.environ.get("VERCEL") else os.path.join(os.path.dirname(__file__), "..", "soc_dashboard.db"))

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

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            real_name TEXT DEFAULT '',
            status TEXT DEFAULT 'Active'
        );

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

    # Threat Feeds table
    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS threat_feeds (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            type TEXT NOT NULL,
            category TEXT NOT NULL,
            status TEXT NOT NULL,
            last_updated TEXT,
            indicator_count INTEGER DEFAULT 0,
            schedule TEXT DEFAULT 'Daily at 00:00 AM'
        );
        
        CREATE TABLE IF NOT EXISTS threat_indicators (
            id TEXT PRIMARY KEY,
            feed_id TEXT NOT NULL,
            type TEXT NOT NULL,
            indicator TEXT NOT NULL,
            description TEXT,
            FOREIGN KEY(feed_id) REFERENCES threat_feeds(id) ON DELETE CASCADE
        )
    """)
    
    # Seed AlienVault if not exists
    cursor.execute("SELECT count(*) FROM threat_feeds")
    if cursor.fetchone()[0] == 0:
        import uuid
        cursor.execute("""
        INSERT INTO threat_feeds (id, name, url, type, category, status, last_updated, indicator_count) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (str(uuid.uuid4()), "AlienVault OTX", "https://otx.alienvault.com/otxapi/pulses/6a3407d69c9a31c90e0debe2/export/?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlNJTkdITkswMDEiLCJ2YWx1ZSI6WyI2YTM0MDdkNjljOWEzMWM5MGUwZGViZTIiLCJjc3YiXSwiZXhwIjoxNzkwNDU1OTY4fQ.W073M-1h5Jx10LfkftEhX6hvwe3YjFzdrdvvBCukumM&format=csv", "API", "Mixed", "Active", None, 0))
    
    conn.commit()

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

    # Seed default users
    count_u = cursor.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if count_u == 0:
        cursor.execute("INSERT INTO users (id, username, password, role, real_name, status) VALUES (?, ?, ?, ?, ?, ?)", (str(uuid.uuid4()), 'admin', 'Singhnk.001k', 'admin', 'Administrator', 'Active'))
        cursor.execute("INSERT INTO users (id, username, password, role, real_name, status) VALUES (?, ?, ?, ?, ?, ?)", (str(uuid.uuid4()), 'readonly', 'readonly@123', 'readonly', 'Read Only User', 'Active'))

    count_uc = cursor.execute("SELECT COUNT(*) FROM use_cases").fetchone()[0]
    if count_uc == 0:
        _seed_use_cases(cursor)

    # Seed Sample Data for Vercel visibility
    _seed_sample_data(cursor)

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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, uc_data)


def _seed_use_cases(cursor: sqlite3.Cursor):
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, seed_data)


def _seed_parsers(cursor: sqlite3.Cursor):
    """Seed custom log parsers."""
    parsers_data = [
        ("PARSER-01", "Cisco ASA Firewall", r"%ASA-\d+-(\d+): (.+)", "Parses Cisco ASA syslog messages", 1, "syslog"),
        ("PARSER-02", "Nginx Access Log", r"(?P<ip>\S+) \S+ \S+ \[.*?\] \"(?P<method>\S+) (?P<path>\S+) \S+\" (?P<status>\d+) .*", "Parses Nginx access logs", 1, "nginx")
    ]
    cursor.executemany("INSERT INTO parsers (id, name, regex, description, active, log_source) VALUES (?, ?, ?, ?, ?, ?)", parsers_data)

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
        "INSERT INTO mitre_mappings (event_id, title, description, tactic, tactic_id, technique, technique_id, severity, platform) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
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





class FeedRequest(BaseModel):
    name: str
    url: str
    type: str
    category: str
    schedule: str = "Daily at 00:00 AM"

@app.get("/api/threat-feeds")
def get_threat_feeds():
    try:
        with sqlite3.connect("soc_dashboard.db") as conn:
            cursor = conn.cursor()
            # Try to add schedule column if missing
            try:
                cursor.execute("ALTER TABLE threat_feeds ADD COLUMN schedule TEXT DEFAULT 'Daily at 00:00 AM'")
            except:
                pass
            
            cursor.execute("SELECT id, name, url, type, category, status, last_updated, indicator_count, schedule FROM threat_feeds")
            feeds = [{"id": r[0], "name": r[1], "url": r[2], "type": r[3], "category": r[4], "status": r[5], "last_updated": r[6], "indicator_count": r[7], "schedule": r[8] if len(r)>8 else "Daily"} for r in cursor.fetchall()]
            return {"data": feeds}
    except Exception as e:
        return {"data": [], "error": str(e)}

@app.post("/api/threat-feeds")
def add_threat_feed(req: FeedRequest):
    with sqlite3.connect("soc_dashboard.db") as conn:
        cursor = conn.cursor()
        feed_id = str(uuid.uuid4())
        cursor.execute("INSERT INTO threat_feeds (id, name, url, type, category, status, indicator_count, schedule) VALUES (?, ?, ?, ?, ?, 'Active', 0, ?)", (feed_id, req.name, req.url, req.type, req.category, req.schedule))
        conn.commit()
        return {"status": "success", "id": feed_id}

@app.get("/api/threat-feeds/{feed_id}/indicators")
def get_feed_indicators(feed_id: str):
    with sqlite3.connect("soc_dashboard.db") as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT type, indicator, description FROM threat_indicators WHERE feed_id = ? LIMIT 100", (feed_id,))
        indicators = [{"type": r[0], "indicator": r[1], "description": r[2]} for r in cursor.fetchall()]
        return {"data": indicators}

@app.post("/api/threat-feeds/{feed_id}/sync")
def sync_feed(feed_id: str):
    import urllib.request
    import csv
    from io import StringIO
    from datetime import datetime
    import uuid
    
    with sqlite3.connect("soc_dashboard.db") as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT url FROM threat_feeds WHERE id = ?", (feed_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Feed not found")
        
        url = row[0]
        
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            response = urllib.request.urlopen(req).read().decode('utf-8')
            
            f = StringIO(response)
            reader = csv.DictReader(f)
            
            # Clear old indicators for this feed
            cursor.execute("DELETE FROM threat_indicators WHERE feed_id = ?", (feed_id,))
            
            count = 0
            for r in reader:
                # Clean keys
                clean_r = {k.strip().replace('"', ''): v.strip().replace('"', '') for k, v in r.items()}
                t = clean_r.get('Indicator type', 'Unknown')
                i = clean_r.get('Indicator', '')
                d = clean_r.get('Description', '')
                if i:
                    cursor.execute("INSERT INTO threat_indicators (id, feed_id, type, indicator, description) VALUES (?, ?, ?, ?, ?)", (str(uuid.uuid4()), feed_id, t, i, d))
                    count += 1
            
            now = datetime.utcnow().isoformat() + "Z"
            cursor.execute("UPDATE threat_feeds SET indicator_count = ?, last_updated = ? WHERE id = ?", (count, now, feed_id))
            conn.commit()
            
            return {"status": "success", "count": count, "last_updated": now}
        except Exception as e:
            cursor.execute("UPDATE threat_feeds SET status = ? WHERE id = ?", ("Error", feed_id))
            conn.commit()
            return {"status": "error", "message": str(e)}

@app.delete("/api/threat-feeds/{feed_id}")
def delete_feed(feed_id: str):
    with sqlite3.connect("soc_dashboard.db") as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM threat_feeds WHERE id = ?", (feed_id,))
        cursor.execute("DELETE FROM threat_indicators WHERE feed_id = ?", (feed_id,))
        conn.commit()
        return {"status": "success"}

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/auth/login")
def login(req: LoginRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT username, role, status, real_name FROM users WHERE username COLLATE NOCASE = ? AND password = ?", (req.username, req.password))
    user = cursor.fetchone()
    conn.close()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user[2] != 'Active':
        raise HTTPException(status_code=403, detail="Account disabled")
    return {"username": user[0], "role": user[1], "status": user[2], "real_name": user[3] or user[0]}

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
        cursor.execute("INSERT INTO users (id, username, password, role, real_name) VALUES (?, ?, ?, ?, ?)", 
                      (user_id, user.username, user.password, user.role, user.real_name))
        conn.commit()
        return {"id": user_id, "username": user.username, "role": user.role, "status": "Active", "real_name": user.real_name}
    except sqlite3.IntegrityError:
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
        updates.append("password = ?")
        params.append(user.password)
    if user.role:
        updates.append("role = ?")
        params.append(user.role)
    if user.status:
        updates.append("status = ?")
        params.append(user.status)
    if user.real_name is not None:
        updates.append("real_name = ?")
        params.append(user.real_name)
        
    if updates:
        params.append(user_id)
        cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
    conn.close()
    return {"success": True}

@app.delete("/api/users/{user_id}")
def delete_user(user_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return {"success": True}

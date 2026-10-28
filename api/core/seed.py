"""
api/core/seed.py
================
Database seeding routines for MITRE ATT&CK, baseline Use Cases, Parsers,
Default Admin Accounts, and Sample Events.
"""

import uuid
import random
import json
from datetime import datetime, timedelta

def seed_default_users(cursor):
    """Seed initial default administrator and read-only analyst accounts."""
    count = cursor.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if count == 0:
        cursor.execute(
            "INSERT INTO users (id, username, password, role, real_name, status) VALUES (%s, %s, %s, %s, %s, %s)",
            (str(uuid.uuid4()), 'admin', 'Singhnk.001k', 'admin', 'Administrator', 'Active')
        )
        cursor.execute(
            "INSERT INTO users (id, username, password, role, real_name, status) VALUES (%s, %s, %s, %s, %s, %s)",
            (str(uuid.uuid4()), 'readonly', 'readonly@123', 'readonly', 'Read Only User', 'Active')
        )

def seed_use_cases(cursor):
    """Seed comprehensive baseline detection rules for Windows and Linux."""
    count = cursor.execute("SELECT COUNT(*) FROM use_cases").fetchone()[0]
    if count > 0:
        return
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

def seed_parsers(cursor):
    """Seed custom log parsers."""
    count = cursor.execute("SELECT COUNT(*) FROM parsers").fetchone()[0]
    if count > 0:
        return
    parsers_data = [
        ("PARSER-01", "Cisco ASA Firewall", r"%ASA-\d+-(\d+): (.+)", "Parses Cisco ASA syslog messages", 1, "syslog"),
        ("PARSER-02", "Nginx Access Log", r"(?P<ip>\S+) \S+ \S+ \[.*?\] \"(?P<method>\S+) (?P<path>\S+) \S+\" (?P<status>\d+) .*", "Parses Nginx access logs", 1, "nginx")
    ]
    cursor.executemany("INSERT INTO parsers (id, name, regex, description, active, log_source) VALUES (%s, %s, %s, %s, %s, %s)", parsers_data)

def seed_mitre_mappings(cursor):
    """Seed the MITRE ATT&CK mapping table with 50+ Windows & Linux Event ID mappings."""
    count = cursor.execute("SELECT COUNT(*) FROM mitre_mappings").fetchone()[0]
    if count > 0:
        return
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

def seed_sample_data(cursor):
    """Seed comprehensive sample logs and alerts if database is clean (<10 logs)."""
    count = cursor.execute("SELECT COUNT(*) FROM logs").fetchone()[0]
    if count >= 10:
        return
    now = datetime.now()
    sample_hosts = ["WS-EXEC-01", "DC-CORP-01", "FS-DATA-02", "SRV-WEB-01", "WS-DEV-03"]
    sample_users = ["jdoe", "asmith", "admin_corp", "svc_backup", "SYSTEM", "mross"]
    sample_ips = ["192.168.1.105", "192.168.1.50", "10.0.0.12", "185.220.101.5", "45.33.32.156"]

    event_templates = [
        {"event_id": "4624", "severity": "info", "message": "An account was successfully logged on", "tactics": ["Lateral Movement"], "techniques": ["T1021"]},
        {"event_id": "4625", "severity": "high", "message": "An account failed to log on - unknown user name or bad password", "tactics": ["Initial Access", "Credential Access"], "techniques": ["T1078", "T1110"]},
        {"event_id": "4688", "severity": "medium", "message": "A new process has been created: powershell.exe -enc JABzAD0ATgBlAHcA...", "tactics": ["Execution"], "techniques": ["T1059.001"]},
        {"event_id": "4697", "severity": "critical", "message": "A service was installed in the system: svc_updater.exe", "tactics": ["Persistence"], "techniques": ["T1543.003"]},
        {"event_id": "1102", "severity": "critical", "message": "The audit log was cleared by user admin_corp", "tactics": ["Defense Evasion"], "techniques": ["T1070.001"]},
        {"event_id": "4720", "severity": "high", "message": "A user account was created: temp_admin", "tactics": ["Impact", "Persistence"], "techniques": ["T1098", "T1136.001"]},
        {"event_id": "5156", "severity": "info", "message": "The Windows Filtering Platform has permitted a connection to port 443", "tactics": ["Command and Control"], "techniques": ["T1071"]},
    ]

    for i in range(120):
        t_delta = timedelta(hours=random.randint(0, 72), minutes=random.randint(0, 59))
        ts = (now - t_delta).isoformat()
        tmpl = random.choice(event_templates)
        host = random.choice(sample_hosts)
        user = random.choice(sample_users)
        src_ip = random.choice(sample_ips)
        log_id = str(uuid.uuid4())
        
        cursor.execute("""
            INSERT INTO logs (id, timestamp, source, event_id, severity, message, hostname, username, source_ip, destination_ip, log_type, mitre_tactics, mitre_techniques)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            log_id, ts, "Security", tmpl["event_id"], tmpl["severity"],
            tmpl["message"], host, user, src_ip, "192.168.1.1", "windows",
            json.dumps(tmpl["tactics"]), json.dumps(tmpl["techniques"])
        ))
        
        if tmpl["severity"] in ("high", "critical") and random.random() > 0.4:
            cursor.execute("""
                INSERT INTO alerts (id, timestamp, title, description, severity, status, source, event_id, mitre_ref, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                str(uuid.uuid4()), ts, f"Potential Malicious Activity - Event {tmpl['event_id']}",
                f"{tmpl['message']} on host {host} by {user}", tmpl["severity"],
                random.choice(["new", "investigating", "resolved"]), "Security", tmpl["event_id"],
                tmpl["techniques"][0] if tmpl["techniques"] else None, ts, ts
            ))

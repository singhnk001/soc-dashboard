#!/usr/bin/env python3
"""
Firewall Log Generator for SOC Dashboard
=========================================
Generates realistic firewall logs (Cisco ASA, Palo Alto, Fortinet) and
blasts them to the SOC Dashboard ingest API.

Usage:
    python generate_firewall_logs.py                  # default: 500 logs, all vendors
    python generate_firewall_logs.py --count 2000     # 2000 logs
    python generate_firewall_logs.py --vendor cisco   # cisco only
    python generate_firewall_logs.py --burst 50       # 50 logs per batch
    python generate_firewall_logs.py --api http://localhost:8000
"""

import argparse
import json
import random
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

# ---------------------------------------------------------------------------
# Realistic IP pools
# ---------------------------------------------------------------------------
MALICIOUS_IPS = [
    # Known bad actors (from common threat intel feeds)
    "185.220.101.45", "194.165.16.11", "45.33.32.156",
    "23.129.64.131", "162.247.74.201", "198.98.55.203",
    "104.244.76.13",  "185.100.87.202", "178.175.131.101",
    "91.108.4.4",     "195.123.245.14", "91.219.28.165",
    "176.10.104.240", "37.120.137.12",  "5.188.86.172",
    "103.21.244.0",   "192.42.116.16",  "62.102.148.69",
    "185.130.5.231",  "109.70.100.23",
]

INTERNAL_IPS = [f"192.168.{random.randint(1,10)}.{random.randint(1,254)}" for _ in range(30)]
INTERNAL_IPS += ["10.0.0.5", "10.0.0.10", "10.0.1.50", "172.16.0.1", "172.16.0.254"]

DMZ_IPS = ["10.10.10.5", "10.10.10.6", "10.10.10.10", "10.10.10.20"]

EXTERNAL_IPS_BENIGN = [
    "8.8.8.8", "1.1.1.1", "208.67.222.222", "9.9.9.9",
    "151.101.1.140", "13.107.42.14", "52.96.0.0", "20.190.128.0",
    "72.21.91.29", "54.239.28.85",
]

GEOIP = {
    "185.220.101.45": "RU", "194.165.16.11": "CN", "45.33.32.156": "US",
    "23.129.64.131":  "US", "162.247.74.201": "US", "198.98.55.203": "US",
    "104.244.76.13":  "SE", "185.100.87.202": "NL", "178.175.131.101": "RU",
    "91.108.4.4":     "RU", "195.123.245.14": "UA", "91.219.28.165": "RU",
    "176.10.104.240": "AT", "37.120.137.12":  "DE", "5.188.86.172": "RU",
    "8.8.8.8": "US", "1.1.1.1": "US",
}

# ---------------------------------------------------------------------------
# Port / protocol / service maps
# ---------------------------------------------------------------------------
COMMON_PORTS = {
    80: "HTTP", 443: "HTTPS", 22: "SSH", 21: "FTP", 23: "TELNET",
    25: "SMTP", 3389: "RDP", 445: "SMB", 1433: "MSSQL", 3306: "MySQL",
    8080: "HTTP-ALT", 8443: "HTTPS-ALT", 53: "DNS", 161: "SNMP",
    389: "LDAP", 636: "LDAPS", 5985: "WinRM", 6379: "Redis",
    27017: "MongoDB", 5432: "PostgreSQL",
}

SCAN_PORTS = [21, 22, 23, 25, 80, 443, 445, 3389, 8080, 8443, 1433, 3306, 5432, 6379]

PROTOCOLS = ["TCP", "UDP", "ICMP"]

# ---------------------------------------------------------------------------
# MITRE mappings for firewall events
# ---------------------------------------------------------------------------
MITRE_MAP = {
    "port_scan":          {"tactics": ["Reconnaissance"], "techniques": ["T1595", "T1046"]},
    "brute_force":        {"tactics": ["Credential Access"], "techniques": ["T1110"]},
    "c2_outbound":        {"tactics": ["Command and Control"], "techniques": ["T1071", "T1043"]},
    "lateral_movement":   {"tactics": ["Lateral Movement"], "techniques": ["T1021"]},
    "data_exfil":         {"tactics": ["Exfiltration"], "techniques": ["T1041", "T1048"]},
    "malware_download":   {"tactics": ["Initial Access", "Execution"], "techniques": ["T1566", "T1204"]},
    "rdp_attempt":        {"tactics": ["Initial Access"], "techniques": ["T1021.001"]},
    "smb_lateral":        {"tactics": ["Lateral Movement"], "techniques": ["T1021.002"]},
    "dns_tunneling":      {"tactics": ["Command and Control"], "techniques": ["T1071.004"]},
    "normal_traffic":     {"tactics": [], "techniques": []},
}

# ---------------------------------------------------------------------------
# Scenario weights (probability distribution)
# ---------------------------------------------------------------------------
SCENARIOS = [
    ("port_scan",       0.15),
    ("brute_force",     0.10),
    ("c2_outbound",     0.08),
    ("rdp_attempt",     0.12),
    ("smb_lateral",     0.05),
    ("data_exfil",      0.05),
    ("malware_download",0.05),
    ("dns_tunneling",   0.03),
    ("normal_traffic",  0.37),
]

def pick_scenario():
    r = random.random()
    total = 0.0
    for name, prob in SCENARIOS:
        total += prob
        if r < total:
            return name
    return "normal_traffic"

# ---------------------------------------------------------------------------
# Timestamp generator (spread logs over last 24h)
# ---------------------------------------------------------------------------
def rand_ts(hours_back=24):
    delta = random.uniform(0, hours_back * 3600)
    dt = datetime.now(timezone.utc) - timedelta(seconds=delta)
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + "+00:00"

# ---------------------------------------------------------------------------
# Cisco ASA log builder
# ---------------------------------------------------------------------------
def cisco_asa_log(scenario):
    src = random.choice(MALICIOUS_IPS if scenario != "normal_traffic" else EXTERNAL_IPS_BENIGN)
    dst_ip = random.choice(INTERNAL_IPS) if scenario in ("port_scan", "brute_force", "rdp_attempt", "smb_lateral") else random.choice(DMZ_IPS)
    src_port = random.randint(1024, 65535)
    proto = "TCP" if scenario != "dns_tunneling" else "UDP"

    if scenario == "port_scan":
        dst_port = random.choice(SCAN_PORTS)
        action = "Deny"
        event_id = "ASA-4-106023"
        severity = "medium"
        msg = (f"Deny {proto} src outside:{src}/{src_port} dst inside:{dst_ip}/{dst_port} "
               f"by access-group 'OUTSIDE_IN' [0x0, 0x0]")
    elif scenario == "brute_force":
        dst_port = 22 if random.random() > 0.4 else 3389
        action = "Deny" if random.random() > 0.1 else "Permit"
        event_id = "ASA-6-302013" if action == "Permit" else "ASA-4-106023"
        severity = "high"
        msg = (f"{'Built' if action == 'Permit' else 'Deny'} inbound TCP connection "
               f"{src}/{src_port} to {dst_ip}/{dst_port} -- repeated auth failure")
    elif scenario == "rdp_attempt":
        dst_port = 3389
        action = "Deny"
        event_id = "ASA-4-106023"
        severity = "high"
        msg = f"Deny TCP src outside:{src}/{src_port} dst inside:{dst_ip}/3389 RDP blocked by policy"
    elif scenario == "smb_lateral":
        src = random.choice(INTERNAL_IPS)
        dst_ip = random.choice(INTERNAL_IPS)
        dst_port = 445
        action = "Permit"
        event_id = "ASA-6-302013"
        severity = "medium"
        msg = f"Built inbound TCP connection {src}/{src_port} to {dst_ip}/445 (SMB lateral)"
    elif scenario == "c2_outbound":
        src = random.choice(INTERNAL_IPS)
        dst_ip = random.choice(MALICIOUS_IPS)
        dst_port = random.choice([443, 8080, 4444, 1337, 9001])
        action = "Permit"
        event_id = "ASA-6-302013"
        severity = "critical"
        msg = f"Built outbound TCP {src}/{src_port} to {dst_ip}/{dst_port} -- possible C2 beacon"
    elif scenario == "data_exfil":
        src = random.choice(INTERNAL_IPS)
        dst_ip = random.choice(EXTERNAL_IPS_BENIGN + MALICIOUS_IPS[:5])
        dst_port = random.choice([443, 21, 22])
        action = "Permit"
        event_id = "ASA-6-302013"
        severity = "high"
        bytes_sent = random.randint(50000000, 500000000)
        msg = f"Teardown TCP connection {src}/{src_port} to {dst_ip}/{dst_port} bytes {bytes_sent}"
    elif scenario == "dns_tunneling":
        src = random.choice(INTERNAL_IPS)
        dst_ip = "8.8.8.8"
        dst_port = 53
        action = "Permit"
        event_id = "ASA-6-302015"
        severity = "high"
        msg = f"Built outbound UDP connection {src}/{src_port} to {dst_ip}/53 -- large DNS query pattern"
    elif scenario == "malware_download":
        src = random.choice(INTERNAL_IPS)
        dst_ip = random.choice(MALICIOUS_IPS)
        dst_port = 80
        action = "Permit"
        event_id = "ASA-6-302013"
        severity = "critical"
        msg = f"Built outbound TCP {src}/{src_port} to {dst_ip}/80 -- malware download URL match"
    else:  # normal_traffic
        src = random.choice(INTERNAL_IPS)
        dst_ip = random.choice(EXTERNAL_IPS_BENIGN)
        dst_port = random.choice([80, 443, 53, 25])
        action = "Permit"
        event_id = "ASA-6-302013"
        severity = "info"
        msg = (f"Built outbound {proto} connection {src}/{src_port} to "
               f"{dst_ip}/{dst_port} ({COMMON_PORTS.get(dst_port,'UNKNOWN')})")

    geo = GEOIP.get(src, GEOIP.get(dst_ip, "??"))
    mitre = MITRE_MAP[scenario]
    return {
        "timestamp": rand_ts(),
        "source": "Cisco-ASA",
        "event_id": event_id,
        "severity": severity,
        "message": msg,
        "hostname": random.choice(["ASA-FW-01", "ASA-FW-02", "ASA-EDGE"]),
        "username": None,
        "raw_log": json.dumps({
            "vendor": "Cisco", "device": "ASA",
            "action": action, "protocol": proto,
            "src_ip": src, "src_port": src_port,
            "dst_ip": dst_ip, "dst_port": dst_port,
            "geo_country": geo,
            "scenario": scenario,
            "bytes": random.randint(64, 1500000) if action == "Permit" else 0,
        }),
        "mitre_tactics": mitre["tactics"],
        "mitre_techniques": mitre["techniques"],
    }

# ---------------------------------------------------------------------------
# Palo Alto PAN-OS log builder
# ---------------------------------------------------------------------------
def palo_alto_log(scenario):
    src = random.choice(MALICIOUS_IPS if scenario != "normal_traffic" else EXTERNAL_IPS_BENIGN)
    dst_ip = random.choice(INTERNAL_IPS)
    src_port = random.randint(1024, 65535)
    proto = "tcp"

    if scenario == "port_scan":
        dst_port = random.choice(SCAN_PORTS)
        action = "deny"
        event_id = "PAN-THREAT-8001"
        severity = "medium"
        app = "unknown"
        rule = "Block-External-Scan"
        msg = f"THREAT: Port scan detected from {src} targeting {dst_ip} on port {dst_port}"
    elif scenario == "brute_force":
        dst_port = random.choice([22, 3389, 21])
        action = "deny"
        event_id = "PAN-THREAT-40000"
        severity = "high"
        app = "ssh" if dst_port == 22 else "ms-rdp"
        rule = "Block-BruteForce"
        msg = f"THREAT: Brute force attempt {src}:{src_port} -> {dst_ip}:{dst_port} [{app}]"
    elif scenario == "c2_outbound":
        src = random.choice(INTERNAL_IPS)
        dst_ip = random.choice(MALICIOUS_IPS)
        dst_port = random.choice([443, 8080, 4444])
        action = "allow"
        event_id = "PAN-THREAT-8005"
        severity = "critical"
        app = "ssl"
        rule = "Allow-Outbound-Web"
        msg = f"THREAT: C2 beacon detected {src} -> {dst_ip}:{dst_port} [WildFire verdict: malicious]"
    elif scenario == "malware_download":
        src = random.choice(INTERNAL_IPS)
        dst_ip = random.choice(MALICIOUS_IPS)
        dst_port = 80
        action = "block"
        event_id = "PAN-THREAT-52000"
        severity = "critical"
        app = "web-browsing"
        rule = "AV-Block"
        msg = f"THREAT: Malware download blocked. File: malware.exe URL: http://{dst_ip}/payload.exe"
    elif scenario == "rdp_attempt":
        dst_port = 3389
        action = "deny"
        event_id = "PAN-TRAFFIC-0"
        severity = "high"
        app = "ms-rdp"
        rule = "Block-RDP-External"
        msg = f"TRAFFIC: Denied RDP {src}:{src_port} -> {dst_ip}:3389 rule:{rule}"
    elif scenario == "dns_tunneling":
        src = random.choice(INTERNAL_IPS)
        dst_ip = "8.8.8.8"
        dst_port = 53
        proto = "udp"
        action = "allow"
        event_id = "PAN-THREAT-9999"
        severity = "high"
        app = "dns"
        rule = "Allow-DNS"
        msg = f"THREAT: DNS tunneling detected from {src} -- anomalous query length/frequency"
    elif scenario == "data_exfil":
        src = random.choice(INTERNAL_IPS)
        dst_ip = random.choice(EXTERNAL_IPS_BENIGN)
        dst_port = 443
        action = "allow"
        event_id = "PAN-TRAFFIC-0"
        severity = "high"
        app = "ssl"
        rule = "Allow-Outbound-Web"
        bytes_sent = random.randint(100000000, 2000000000)
        msg = f"TRAFFIC: Unusually large upload {src} -> {dst_ip}:443 bytes={bytes_sent}"
    elif scenario == "smb_lateral":
        src = random.choice(INTERNAL_IPS)
        dst_ip = random.choice(INTERNAL_IPS)
        dst_port = 445
        action = "allow"
        event_id = "PAN-THREAT-30000"
        severity = "medium"
        app = "msrpc-base"
        rule = "Allow-Internal"
        msg = f"THREAT: Lateral movement via SMB {src} -> {dst_ip}:445"
    else:  # normal
        dst_port = random.choice([80, 443, 53])
        action = "allow"
        event_id = "PAN-TRAFFIC-0"
        severity = "info"
        app = COMMON_PORTS.get(dst_port, "unknown").lower()
        rule = "Allow-Outbound-Web"
        msg = f"TRAFFIC: {action} {proto} {src}:{src_port} -> {dst_ip}:{dst_port} app:{app} rule:{rule}"

    mitre = MITRE_MAP[scenario]
    geo = GEOIP.get(src, GEOIP.get(dst_ip, "??"))
    return {
        "timestamp": rand_ts(),
        "source": "Palo-Alto-PAN-OS",
        "event_id": event_id,
        "severity": severity,
        "message": msg,
        "hostname": random.choice(["PA-220-EDGE", "PA-820-CORE", "PA-3220-DC"]),
        "username": None,
        "raw_log": json.dumps({
            "vendor": "Palo Alto", "device": "PAN-OS",
            "action": action, "protocol": proto,
            "src_ip": src, "src_port": src_port,
            "dst_ip": dst_ip, "dst_port": dst_port,
            "application": app if "app" in dir() else "unknown",
            "rule_name": rule if "rule" in dir() else "default",
            "geo_country": geo,
            "scenario": scenario,
            "session_id": random.randint(100000, 999999),
            "bytes_in": random.randint(64, 500000),
            "bytes_out": random.randint(64, 10000000),
        }),
        "mitre_tactics": mitre["tactics"],
        "mitre_techniques": mitre["techniques"],
    }

# ---------------------------------------------------------------------------
# Fortinet FortiGate log builder
# ---------------------------------------------------------------------------
def fortinet_log(scenario):
    src = random.choice(MALICIOUS_IPS if scenario != "normal_traffic" else EXTERNAL_IPS_BENIGN)
    dst_ip = random.choice(INTERNAL_IPS)
    src_port = random.randint(1024, 65535)

    if scenario == "port_scan":
        dst_port = random.choice(SCAN_PORTS)
        action = "drop"
        event_id = "FG-TRAFFIC-0021"
        severity = "medium"
        msg = (f"type=traffic subtype=forward level=warning "
               f"srcip={src} srcport={src_port} dstip={dst_ip} dstport={dst_port} "
               f"action=drop service=GENERIC policyid=10 msg=\"IP detected port scan\"")
    elif scenario == "brute_force":
        dst_port = random.choice([22, 3389])
        action = "drop"
        event_id = "FG-IPS-0001"
        severity = "high"
        msg = (f"type=ips subtype=signature level=alert "
               f"srcip={src} dstip={dst_ip} dstport={dst_port} "
               f"attackid=39832 attack=\"SSH.Login.Brute.Force\" action=dropped")
    elif scenario == "c2_outbound":
        src = random.choice(INTERNAL_IPS)
        dst_ip = random.choice(MALICIOUS_IPS)
        dst_port = random.choice([443, 8080, 4444])
        action = "accept"
        event_id = "FG-WEBFILTER-0013"
        severity = "critical"
        msg = (f"type=webfilter subtype=urlfilter level=warning "
               f"srcip={src} dstip={dst_ip} dstport={dst_port} "
               f"url=\"https://{dst_ip}/gate.php\" cat=Malware action=warning msg=\"C2 URL detected\"")
    elif scenario == "malware_download":
        src = random.choice(INTERNAL_IPS)
        dst_ip = random.choice(MALICIOUS_IPS)
        dst_port = 80
        action = "block"
        event_id = "FG-AV-0101"
        severity = "critical"
        msg = (f"type=utm subtype=virus level=warning "
               f"srcip={src} dstip={dst_ip} "
               f"filename=\"update.exe\" virus=\"Trojan.Generic.{random.randint(1000,9999)}\" action=blocked")
    elif scenario == "rdp_attempt":
        dst_port = 3389
        action = "drop"
        event_id = "FG-TRAFFIC-0021"
        severity = "high"
        msg = (f"type=traffic subtype=forward level=warning "
               f"srcip={src} dstip={dst_ip} dstport=3389 service=RDP "
               f"action=drop policyid=5 msg=\"RDP from untrusted zone denied\"")
    elif scenario == "dns_tunneling":
        src = random.choice(INTERNAL_IPS)
        dst_ip = "8.8.8.8"
        dst_port = 53
        action = "accept"
        event_id = "FG-DNS-0002"
        severity = "high"
        msg = (f"type=dns subtype=dns-response level=notice "
               f"srcip={src} dstip={dst_ip} "
               f"qtype=TXT qname=\"aGVsbG8gd29ybGQ.{random.randint(100,999)}.evil.com\" "
               f"msg=\"DNS tunneling pattern detected -- high entropy subdomain\"")
    elif scenario == "data_exfil":
        src = random.choice(INTERNAL_IPS)
        dst_ip = random.choice(EXTERNAL_IPS_BENIGN)
        dst_port = 443
        action = "accept"
        event_id = "FG-DLPSENSOR-0001"
        severity = "high"
        bytes_sent = random.randint(50000000, 500000000)
        msg = (f"type=dlp subtype=dlpsensor level=warning "
               f"srcip={src} dstip={dst_ip} sentbyte={bytes_sent} "
               f"msg=\"DLP: sensitive data pattern matched (credit card/SSN) in outbound HTTPS\"")
    elif scenario == "smb_lateral":
        src = random.choice(INTERNAL_IPS)
        dst_ip = random.choice(INTERNAL_IPS)
        dst_port = 445
        action = "accept"
        event_id = "FG-IPS-0002"
        severity = "medium"
        msg = (f"type=ips subtype=signature level=alert "
               f"srcip={src} dstip={dst_ip} dstport=445 "
               f"attackid=9700 attack=\"MS.SMB.EternalBlue.Exploit.Attempt\" action=passed")
    else:  # normal
        dst_port = random.choice([80, 443, 53, 25])
        action = "accept"
        event_id = "FG-TRAFFIC-0001"
        severity = "info"
        msg = (f"type=traffic subtype=forward level=information "
               f"srcip={src} srcport={src_port} dstip={dst_ip} dstport={dst_port} "
               f"service={COMMON_PORTS.get(dst_port,'GENERIC')} action=accept "
               f"sentbyte={random.randint(100,50000)} rcvdbyte={random.randint(100,500000)}")

    mitre = MITRE_MAP[scenario]
    geo = GEOIP.get(src, GEOIP.get(dst_ip, "??"))
    return {
        "timestamp": rand_ts(),
        "source": "Fortinet-FortiGate",
        "event_id": event_id,
        "severity": severity,
        "message": msg,
        "hostname": random.choice(["FGT-60E-BRANCH", "FGT-200E-HQ", "FGT-VM-CLOUD"]),
        "username": None,
        "raw_log": json.dumps({
            "vendor": "Fortinet", "device": "FortiGate",
            "action": action,
            "src_ip": src, "src_port": src_port,
            "dst_ip": dst_ip, "dst_port": dst_port,
            "geo_country": geo,
            "scenario": scenario,
            "policy_id": random.randint(1, 20),
        }),
        "mitre_tactics": mitre["tactics"],
        "mitre_techniques": mitre["techniques"],
    }

# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------
BUILDERS = {
    "cisco":    cisco_asa_log,
    "palo":     palo_alto_log,
    "fortinet": fortinet_log,
}

def generate_log(vendor=None):
    if vendor is None:
        vendor = random.choice(list(BUILDERS.keys()))
    scenario = pick_scenario()
    return BUILDERS[vendor](scenario)

# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------
def send_batch(api_url, logs):
    payload = json.dumps(logs).encode("utf-8")
    req = urllib.request.Request(
        f"{api_url}/api/logs/ingest",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode()
            result = json.loads(body)
            return result.get("ingested", 0), None
    except urllib.error.HTTPError as e:
        return 0, f"HTTP {e.code}: {e.read().decode()[:200]}"
    except Exception as ex:
        return 0, str(ex)

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Firewall Log Generator for SOC Dashboard")
    parser.add_argument("--count",  type=int, default=500,                   help="Total logs to generate (default: 500)")
    parser.add_argument("--vendor", choices=["cisco","palo","fortinet","all"], default="all", help="Firewall vendor (default: all)")
    parser.add_argument("--burst",  type=int, default=50,                    help="Logs per API batch (default: 50)")
    parser.add_argument("--api",    default="http://localhost:8000",          help="API base URL")
    parser.add_argument("--delay",  type=float, default=0.1,                 help="Delay between batches in seconds (default: 0.1)")
    args = parser.parse_args()

    vendor = None if args.vendor == "all" else args.vendor
    total = args.count
    burst = args.burst
    sent = 0
    errors = 0

    print(f"\n{'='*60}")
    print(f"  SOC Dashboard Firewall Log Generator")
    print(f"{'='*60}")
    print(f"  Target API : {args.api}")
    print(f"  Total logs : {total}")
    print(f"  Vendor     : {args.vendor}")
    print(f"  Batch size : {burst}")
    print(f"{'='*60}\n")

    scenario_counts = {}
    severity_counts = {}

    while sent < total:
        batch_size = min(burst, total - sent)
        batch = []
        for _ in range(batch_size):
            log = generate_log(vendor)
            batch.append(log)
            # track stats
            sc = json.loads(log["raw_log"]).get("scenario", "unknown")
            scenario_counts[sc] = scenario_counts.get(sc, 0) + 1
            severity_counts[log["severity"]] = severity_counts.get(log["severity"], 0) + 1

        ingested, err = send_batch(args.api, batch)
        if err:
            print(f"  [BATCH ERROR] {err}")
            errors += 1
            if errors > 5:
                print("\n  Too many errors. Is the API running?")
                print(f"  Start it: cd D:\\SOC-Dashboard\\Dashboard && python -m uvicorn api.index:app --host 0.0.0.0 --port 8000 --workers 2\n")
                break
        else:
            sent += ingested
            pct = int((sent / total) * 40)
            bar = "█" * pct + "░" * (40 - pct)
            print(f"  [{bar}] {sent}/{total} logs  ({ingested} in last batch)", end="\r", flush=True)

        time.sleep(args.delay)

    print(f"\n\n{'='*60}")
    print(f"  Done! {sent} logs ingested  ({errors} batch errors)")
    print(f"\n  Scenario breakdown:")
    for sc, count in sorted(scenario_counts.items(), key=lambda x: -x[1]):
        bar = "█" * int(count / max(scenario_counts.values()) * 20)
        print(f"    {sc:<20} {bar:<20} {count}")
    print(f"\n  Severity breakdown:")
    for sev, count in sorted(severity_counts.items(), key=lambda x: -x[1]):
        print(f"    {sev:<12} {count}")
    print(f"\n  Open your SOC Dashboard Log Explorer to see the results.")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()

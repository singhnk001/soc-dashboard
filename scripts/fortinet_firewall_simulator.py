#!/usr/bin/env python3
"""
Fortinet FortiGate Real-Time Firewall Simulator
===============================================
Emulates a Fortinet FortiGate 100F Enterprise Firewall (FortiOS v7.4.x)
streaming realistic real-time traffic, IPS, UTM, antivirus, and SSL-VPN logs
directly to the SOC Dashboard via HTTP Ingestion API or UDP Syslog (port 514).

Usage:
    # 1. Real-time live stream to SOC Dashboard API (default: 2 logs/sec continuously)
    python scripts/fortinet_firewall_simulator.py --continuous

    # 2. High-speed burst test (e.g. 500 logs)
    python scripts/fortinet_firewall_simulator.py --count 500 --rate 20

    # 3. Stream real UDP Syslog packets on port 514 (to Vector Syslog Collector)
    python scripts/fortinet_firewall_simulator.py --mode syslog --syslog-host 127.0.0.1 --syslog-port 514

    # 4. Custom API endpoint (e.g. remote or cloud)
    python scripts/fortinet_firewall_simulator.py --continuous --api http://localhost:8001
"""

import argparse
import datetime
import json
import random
import socket
import sys
import time
import urllib.request
import urllib.error

# ---------------------------------------------------------------------------
# Device Identity
# ---------------------------------------------------------------------------
DEV_NAME = "FG-100F-HQ-CORE"
DEV_ID = "FG100FTK21004892"
VDOM = "root"

# ---------------------------------------------------------------------------
# Realistic IP & Threat Intel Pools
# ---------------------------------------------------------------------------
INTERNAL_SUBNETS = [
    "192.168.1.", "192.168.10.", "10.0.0.", "10.0.1.", "172.16.50."
]

# Threat Intelligence Watchlist (aligned with ThreatFox & AlienVault OTX feeds)
MALICIOUS_C2_IPS = [
    {"ip": "185.220.101.5",  "threat": "Cobalt Strike C2 Beacon", "country": "RU", "severity": "critical"},
    {"ip": "194.26.29.112",  "threat": "Emotet Botnet Dropper",   "country": "NL", "severity": "critical"},
    {"ip": "45.154.255.88",  "threat": "QakBot Loader Infrastructure", "country": "US", "severity": "high"},
    {"ip": "109.236.87.14",  "threat": "LockBit Ransomware Exfiltration Host", "country": "RU", "severity": "critical"},
    {"ip": "91.240.118.230", "threat": "AsyncRAT Reverse Shell Listener", "country": "UA", "severity": "high"},
    {"ip": "185.130.5.231",  "threat": "Mirai Scanner / Brute-force", "country": "DE", "severity": "medium"},
]

BENIGN_INTERNET_IPS = [
    "8.8.8.8", "1.1.1.1", "142.250.190.46", "13.107.42.14",
    "52.96.166.130", "151.101.1.140", "104.16.132.229", "20.190.159.0"
]

SERVICES = {
    443: {"service": "HTTPS", "proto": 6, "app": "Web.Browsing"},
    80: {"service": "HTTP", "proto": 6, "app": "HTTP.General"},
    53: {"service": "DNS", "proto": 17, "app": "DNS"},
    22: {"service": "SSH", "proto": 6, "app": "SSH"},
    3389: {"service": "RDP", "proto": 6, "app": "MS.RDP"},
    445: {"service": "SMB", "proto": 6, "app": "MS.SMB"},
    8080: {"service": "HTTP-ALT", "proto": 6, "app": "Proxy.HTTP"},
    123: {"service": "NTP", "proto": 17, "app": "NTP"},
}

IPS_ATTACK_SIGNATURES = [
    ("FortiGuard: Apache.Log4j.JNDI.Remote.Code.Execution", "T1190", "critical"),
    ("FortiGuard: MS.Windows.SMBv1.Remote.Code.Execution.EternalBlue", "T1210", "critical"),
    ("FortiGuard: OpenSSL.Heartbleed.Information.Disclosure", "T1595", "high"),
    ("FortiGuard: Fortinet.FortiOS.SSL-VPN.Heap.Buffer.Overflow.CVE-2023-27997", "T1190", "critical"),
    ("FortiGuard: Cobalt.Strike.DNS.Beaconing.Activity", "T1071.004", "critical"),
    ("FortiGuard: SSH.Brute.Force.Login.Attempt", "T1110.001", "medium"),
    ("FortiGuard: Suspicious.PowerShell.Outbound.Connection", "T1059.001", "high"),
]

# ---------------------------------------------------------------------------
# FortiOS Log Generator
# ---------------------------------------------------------------------------
def generate_fortinet_event():
    now = datetime.datetime.now(datetime.timezone.utc)
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M:%S")
    epoch_ns = int(now.timestamp() * 1e9)
    src_ip = random.choice(INTERNAL_SUBNETS) + str(random.randint(10, 240))
    src_port = random.randint(32768, 65530)
    session_id = random.randint(100000, 999999)
    policy_id = random.randint(1, 25)

    scenario_type = random.choices(
        ["normal_traffic", "threat_intel_match", "ips_attack", "ssl_vpn", "denied_traffic"],
        weights=[0.60, 0.12, 0.10, 0.08, 0.10]
    )[0]

    if scenario_type == "threat_intel_match":
        ioc = random.choice(MALICIOUS_C2_IPS)
        dst_ip = ioc["ip"]
        dst_port = random.choice([443, 8080, 8443, 9001])
        action = "deny"
        level = "alert"
        severity = ioc["severity"]
        event_id = "FG-UTM-C2-BLOCKED"
        msg = f"IPS detection: Matched Threat Intelligence IOC {dst_ip} ({ioc['threat']}) - connection blocked"
        mitre_tactics = ["Command and Control", "Initial Access"]
        mitre_techniques = ["T1071", "T1043"]
        raw_msg = (
            f'date={date_str} time={time_str} devname="{DEV_NAME}" devid="{DEV_ID}" '
            f'eventtime={epoch_ns} tz="+0000" logid="0100041001" type="utm" subtype="ips" '
            f'level="{level}" vd="{VDOM}" severity="{severity}" srcip={src_ip} srccountry="Reserved" '
            f'dstip={dst_ip} dstcountry="{ioc["country"]}" srcport={src_port} dstport={dst_port} '
            f'srcintf="port1" srcintfrole="lan" dstintf="port2" dstintfrole="wan" '
            f'sessionid={session_id} action="{action}" attack="{ioc["threat"]}" '
            f'service="HTTPS" msg="{msg}"'
        )

    elif scenario_type == "ips_attack":
        sig_name, technique, severity = random.choice(IPS_ATTACK_SIGNATURES)
        dst_ip = random.choice(BENIGN_INTERNET_IPS)
        dst_port = random.choice([80, 443, 445, 8080, 22])
        action = "dropped"
        level = "alert"
        event_id = "FG-IPS-ATTACK-0044"
        msg = f"Intrusion Prevention signature triggered: {sig_name}"
        mitre_tactics = ["Defense Evasion", "Lateral Movement"]
        mitre_techniques = [technique]
        raw_msg = (
            f'date={date_str} time={time_str} devname="{DEV_NAME}" devid="{DEV_ID}" '
            f'eventtime={epoch_ns} tz="+0000" logid="0100041000" type="utm" subtype="ips" '
            f'level="{level}" vd="{VDOM}" severity="{severity}" srcip={src_ip} '
            f'dstip={dst_ip} srcport={src_port} dstport={dst_port} srcintf="port1" '
            f'dstintf="port2" sessionid={session_id} action="{action}" attack="{sig_name}" '
            f'direction="outgoing" msg="{msg}"'
        )

    elif scenario_type == "ssl_vpn":
        user = random.choice(["jdoe", "asmith", "admin_sec", "external_vendor", "root"])
        action = random.choice(["tunnel-up", "tunnel-down", "login-failed"])
        severity = "high" if action == "login-failed" else "info"
        level = "warning" if action == "login-failed" else "notice"
        event_id = "FG-VPN-SSL-0012"
        rem_ip = random.choice(BENIGN_INTERNET_IPS)
        msg = f"SSL VPN user {user} status: {action} from remote IP {rem_ip}"
        mitre_tactics = ["Credential Access"] if action == "login-failed" else []
        mitre_techniques = ["T1110"] if action == "login-failed" else []
        raw_msg = (
            f'date={date_str} time={time_str} devname="{DEV_NAME}" devid="{DEV_ID}" '
            f'eventtime={epoch_ns} tz="+0000" logid="0101039947" type="event" subtype="vpn" '
            f'level="{level}" vd="{VDOM}" severity="{severity}" user="{user}" '
            f'remip={rem_ip} tunneltype="ssl-tunnel" action="{action}" reason="Tunnel negotiation" '
            f'msg="{msg}"'
        )

    elif scenario_type == "denied_traffic":
        dst_ip = random.choice(BENIGN_INTERNET_IPS)
        dst_port = random.choice([23, 445, 3389, 1433, 5985])
        action = "deny"
        level = "warning"
        severity = "medium"
        event_id = "FG-TRAFFIC-DENIED"
        msg = f"Implicit firewall policy drop: Port {dst_port} prohibited outbound"
        mitre_tactics = ["Initial Access"]
        mitre_techniques = ["T1046"]
        raw_msg = (
            f'date={date_str} time={time_str} devname="{DEV_NAME}" devid="{DEV_ID}" '
            f'eventtime={epoch_ns} tz="+0000" logid="0000000013" type="traffic" subtype="forward" '
            f'level="{level}" vd="{VDOM}" severity="{severity}" srcip={src_ip} '
            f'dstip={dst_ip} srcport={src_port} dstport={dst_port} proto=6 '
            f'srcintf="port1" dstintf="port2" policyid={policy_id} sessionid={session_id} '
            f'action="{action}" msg="{msg}"'
        )

    else:  # normal_traffic
        port, info = random.choice(list(SERVICES.items()))
        dst_ip = random.choice(BENIGN_INTERNET_IPS)
        dst_port = port
        action = "accept"
        level = "notice"
        severity = "info"
        event_id = "FG-TRAFFIC-ACCEPT"
        sentbyte = random.randint(400, 24000)
        rcvdbyte = random.randint(1200, 250000)
        msg = f"Firewall traffic permitted: {info['service']} session closed"
        mitre_tactics = []
        mitre_techniques = []
        raw_msg = (
            f'date={date_str} time={time_str} devname="{DEV_NAME}" devid="{DEV_ID}" '
            f'eventtime={epoch_ns} tz="+0000" logid="0000000020" type="traffic" subtype="forward" '
            f'level="{level}" vd="{VDOM}" severity="{severity}" srcip={src_ip} '
            f'dstip={dst_ip} srcport={src_port} dstport={dst_port} proto={info["proto"]} '
            f'srcintf="port1" dstintf="port2" policyid={policy_id} sessionid={session_id} '
            f'action="{action}" service="{info["service"]}" app="{info["app"]}" '
            f'sentbyte={sentbyte} rcvdbyte={rcvdbyte} duration={random.randint(1, 120)} msg="{msg}"'
        )

    return {
        "timestamp": now.isoformat(),
        "source": "Fortinet-FortiGate",
        "log_type": "Firewall",
        "event_id": event_id,
        "severity": severity,
        "hostname": DEV_NAME,
        "message": msg,
        "raw_log": raw_msg,
        "src_ip": src_ip,
        "dst_ip": dst_ip,
        "src_port": src_port,
        "dst_port": dst_port,
        "action": action,
        "vendor": "Fortinet",
        "model": "FortiGate 100F",
        "mitre_tactics": mitre_tactics,
        "mitre_techniques": mitre_techniques,
    }

# ---------------------------------------------------------------------------
# Ingestion Modes
# ---------------------------------------------------------------------------
def send_via_http(api_url: str, event: dict) -> bool:
    endpoint = f"{api_url.rstrip('/')}/api/logs/ingest"
    payload = json.dumps([event]).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "FortiGate-Simulator/7.4"}
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except Exception as e:
        return False

def send_via_syslog(host: str, port: int, raw_msg: str, sock: socket.socket) -> bool:
    try:
        # RFC3164 Syslog format: <14>Month Day Time devname ...
        now = datetime.datetime.now()
        timestamp = now.strftime("%b %d %H:%M:%S")
        syslog_packet = f"<134>{timestamp} {DEV_NAME}: {raw_msg}\n".encode("utf-8")
        sock.sendto(syslog_packet, (host, port))
        return True
    except Exception:
        return False

# ---------------------------------------------------------------------------
# Main Runner
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Fortinet FortiGate Real-Time Firewall Simulator for SOC Dashboard"
    )
    parser.add_argument("--mode", choices=["http", "syslog"], default="http", help="Transmission mode: http API or UDP syslog (default: http)")
    parser.add_argument("--api", default="http://localhost:8001", help="SOC Dashboard API URL (default: http://localhost:8001)")
    parser.add_argument("--syslog-host", default="127.0.0.1", help="Syslog listener host (default: 127.0.0.1)")
    parser.add_argument("--syslog-port", type=int, default=514, help="Syslog UDP port (default: 514)")
    parser.add_argument("--rate", type=float, default=2.0, help="Logs per second to generate (default: 2.0)")
    parser.add_argument("--count", type=int, default=0, help="Total logs to send (0 = infinite continuous stream, default: 0)")
    parser.add_argument("--continuous", action="store_true", help="Run indefinitely in real-time until Ctrl+C")
    args = parser.parse_args()

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM) if args.mode == "syslog" else None

    print("=" * 72)
    print(" 🛡️  FORTINET FORTIGATE REAL-TIME FIREWALL SIMULATOR (FortiOS v7.4.x)")
    print(f" • Device:    {DEV_NAME} ({DEV_ID})")
    print(f" • Mode:      {args.mode.upper()} -> {'API ' + args.api if args.mode == 'http' else f'UDP {args.syslog_host}:{args.syslog_port}'}")
    print(f" • Rate:      {args.rate} logs/second (Interval: {1.0/args.rate:.2f}s)")
    print(f" • Mode:      {'CONTINUOUS REAL-TIME (Ctrl+C to stop)' if args.continuous or args.count == 0 else f'Batch of {args.count} logs'}")
    print("=" * 72)

    sent = 0
    errors = 0
    threats_detected = 0
    start_time = time.time()
    interval = 1.0 / max(0.1, args.rate)

    try:
        while True:
            event = generate_fortinet_event()
            is_threat = event["severity"] in ["high", "critical"]
            if is_threat:
                threats_detected += 1

            if args.mode == "http":
                ok = send_via_http(args.api, event)
            else:
                ok = send_via_syslog(args.syslog_host, args.syslog_port, event["raw_log"], sock)

            if ok:
                sent += 1
                sev_icon = "🔴" if event["severity"] == "critical" else "🟠" if event["severity"] == "high" else "🟡" if event["severity"] == "medium" else "🟢"
                action_badge = f"[{event['action'].upper()}]"
                print(f"{sev_icon} [{event['timestamp'][11:19]}] {event['source']} | {action_badge:<8} {event['src_ip']} -> {event['dst_ip']}:{event['dst_port']} | {event['message'][:55]}")
            else:
                errors += 1
                print(f"⚠️  Delivery failed to target ({args.mode.upper()}). Check if server/port is listening.", file=sys.stderr)

            if not args.continuous and args.count > 0 and sent >= args.count:
                break

            time.sleep(interval)

    except KeyboardInterrupt:
        print("\n[!] Simulator stopped by user.")
    finally:
        if sock:
            sock.close()
        elapsed = max(0.1, time.time() - start_time)
        print("-" * 72)
        print(f"📊 SUMMARY: Sent: {sent:,} logs | Threats: {threats_detected:,} | Errors: {errors:,} | Elapsed: {elapsed:.1f}s | Avg EPS: {sent/elapsed:.1f}")
        print("-" * 72)

if __name__ == "__main__":
    main()

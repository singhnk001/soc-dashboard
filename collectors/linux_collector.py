import time
import argparse
import requests
import logging
from datetime import datetime
import json
import socket
import os
import re

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def parse_syslog_line(line: str) -> dict:
    """Parse standard syslog RFC 3164/5424 formats into structured data."""
    # Simplified parser for syslog message
    # Format typically: May 12 10:15:30 hostname process[pid]: message
    
    # Extract key=value pairs generic parser
    kv_pairs = dict(re.findall(r'([a-zA-Z0-9_]+)=([^\s]+)', line))
    
    # Check if there's an IP address
    ip_match = re.search(r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b', line)
    if ip_match:
        kv_pairs['ip_address'] = ip_match.group(0)

    # Clean up the message (optional) - for now just use the line
    clean_message = line.strip()

    raw_details = {
        "original_line": line.strip(),
        "extracted_fields": kv_pairs
    }

    entry = {
        "timestamp": datetime.now().isoformat(),
        "source": "Linux-Syslog",
        "severity": "info",
        "message": clean_message[:200],  # Truncate message for UI
        "hostname": socket.gethostname(),
        "username": kv_pairs.get("user") or kv_pairs.get("user_id") or "N/A",
        "raw_log": json.dumps(raw_details),
        "mitre_tactics": [],
        "mitre_techniques": []
    }
    
    lower_line = line.lower()
    
    # Generic security use-case patterns for Linux
    if "sshd" in lower_line:
        if "accepted" in lower_line:
            entry["severity"] = "info"
            entry["mitre_tactics"] = ["Initial Access"]
            entry["mitre_techniques"] = ["T1078"]
        elif "failed password" in lower_line or "invalid user" in lower_line:
            entry["severity"] = "medium"
            entry["mitre_tactics"] = ["Credential Access"]
            entry["mitre_techniques"] = ["T1110"]
    
    elif "sudo" in lower_line:
        entry["mitre_tactics"] = ["Privilege Escalation"]
        entry["mitre_techniques"] = ["T1078"]
        if "incorrect password" in lower_line or "authentication failure" in lower_line:
            entry["severity"] = "medium"
            
    elif "useradd" in lower_line or "groupadd" in lower_line:
        entry["severity"] = "medium"
        entry["mitre_tactics"] = ["Persistence"]
        entry["mitre_techniques"] = ["T1136"]
        
    elif "userdel" in lower_line:
        entry["severity"] = "medium"
        entry["mitre_tactics"] = ["Impact"]
        entry["mitre_techniques"] = ["T1531"]

    elif "cron" in lower_line or "crontab" in lower_line:
        entry["mitre_tactics"] = ["Persistence"]
        entry["mitre_techniques"] = ["T1053.003"]
        
    elif "iptables" in lower_line or "nftables" in lower_line or "ufw" in lower_line:
        entry["severity"] = "medium"
        entry["mitre_tactics"] = ["Defense Evasion"]
        entry["mitre_techniques"] = ["T1562.004"]

    elif any(pkg in lower_line for pkg in ["apt-get", "yum", "dpkg", "apt "]):
        entry["mitre_tactics"] = ["Execution"]
        entry["mitre_techniques"] = ["T1059"]

    # Match generic severity terms
    if any(err in lower_line for err in ["error", "fail", "invalid", "denied", "blocked", "unauthorized"]):
        if entry["severity"] == "info":
            entry["severity"] = "high"
    if any(crit in lower_line for crit in ["fatal", "crit", "segfault", "panic"]):
        entry["severity"] = "critical"
        
    return entry

def follow_file(file_obj):
    """Generator function that yields new lines in a file (tail -f behavior)."""
    file_obj.seek(0, os.SEEK_END)
    while True:
        line = file_obj.readline()
        if not line:
            time.sleep(0.1)
            continue
        yield line

def main():
    parser = argparse.ArgumentParser(description="Linux Log Collector for SOC Dashboard")
    parser.add_argument("--api-url", default="http://localhost:8000/api/logs/ingest", help="API Endpoint URL")
    parser.add_argument("--log-files", nargs="+", default=["/var/log/syslog", "/var/log/auth.log"], help="Log files to monitor")
    
    args = parser.parse_args()
    logging.info(f"Starting Linux log collector. Target API: {args.api_url}")
    
    files = {}
    for filepath in args.log_files:
        try:
            if os.path.exists(filepath):
                f = open(filepath, 'r', encoding='utf-8', errors='replace')
                files[filepath] = f
                logging.info(f"Successfully opened {filepath} for monitoring.")
            else:
                logging.warning(f"Log file {filepath} does not exist.")
        except Exception as e:
            logging.error(f"Could not open {filepath}: {e}")

    if not files:
        logging.error("No valid log files to monitor. Exiting.")
        return

    # A simple loop to read non-blocking from multiple files
    # Note: In production, consider using selectors or asyncio for robust file monitoring.
    
    event_buffer = []
    last_ship_time = time.time()
    SHIP_INTERVAL = 5 # seconds
    
    try:
        while True:
            for filepath, f in files.items():
                # Read all new lines
                while True:
                    pos = f.tell()
                    line = f.readline()
                    if not line:
                        f.seek(pos)
                        break
                    
                    entry = parse_syslog_line(line)
                    entry["source"] = f"Linux-{os.path.basename(filepath)}"
                    event_buffer.append(entry)
            
            # Ship events periodically if buffer isn't empty
            if event_buffer and (time.time() - last_ship_time) > SHIP_INTERVAL:
                try:
                    logging.info(f"Shipping {len(event_buffer)} events to API...")
                    ingest_url = args.api_url if args.api_url.endswith('/api/logs/ingest') else args.api_url.rstrip('/') + '/api/logs/ingest'
                    response = requests.post(ingest_url, json=event_buffer, timeout=10)
                    if response.status_code == 200:
                        logging.info("Successfully shipped events.")
                    else:
                        logging.error(f"Failed to ship events: HTTP {response.status_code}")
                except Exception as e:
                    logging.error(f"Error shipping to API: {e}")
                
                event_buffer = []
                last_ship_time = time.time()
                
            time.sleep(0.5)
            
    except KeyboardInterrupt:
        logging.info("Collector stopped by user.")
    finally:
        for f in files.values():
            f.close()

if __name__ == "__main__":
    main()

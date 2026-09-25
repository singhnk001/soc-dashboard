import subprocess
import xml.etree.ElementTree as ET
import time
import argparse
import requests
import logging
from datetime import datetime, timezone
import json
import socket

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# MITRE ATT&CK Mappings for Windows Event IDs
MITRE_MAPPINGS = {
    "4624": {"tactic": "Initial Access", "technique": "T1078", "desc": "Successful logon (watch for Type 3 network, Type 10 remote)"},
    "4625": {"tactic": "Credential Access", "technique": "T1110", "desc": "Failed logon (brute force detection)"},
    "4648": {"tactic": "Lateral Movement", "technique": "T1078", "desc": "Logon using explicit credentials"},
    "4672": {"tactic": "Privilege Escalation", "technique": "T1078", "desc": "Special privileges assigned"},
    "4688": {"tactic": "Execution", "technique": "T1059", "desc": "Process creation"},
    "4697": {"tactic": "Persistence", "technique": "T1543", "desc": "Service installation"},
    "7045": {"tactic": "Persistence", "technique": "T1543", "desc": "Service installation"},
    "4698": {"tactic": "Persistence", "technique": "T1053", "desc": "Scheduled task created"},
    "4720": {"tactic": "Persistence", "technique": "T1136", "desc": "User account created"},
    "4726": {"tactic": "Impact", "technique": "T1531", "desc": "User account deleted"},
    "4768": {"tactic": "Credential Access", "technique": "T1558", "desc": "Kerberos ticket requests"},
    "4769": {"tactic": "Credential Access", "technique": "T1558", "desc": "Kerberos ticket requests"},
    "4771": {"tactic": "Credential Access", "technique": "T1110", "desc": "Kerberos pre-auth failed"},
    "4776": {"tactic": "Credential Access", "technique": "T1110", "desc": "Credential validation"},
    "1102": {"tactic": "Defense Evasion", "technique": "T1070.001", "desc": "Audit log cleared"},
    "4104": {"tactic": "Execution", "technique": "T1059.001", "desc": "PowerShell script block logging"},
}

def map_severity(level_str: str, event_id: str = "") -> str:
    """Map Windows Event level to standardized severity."""
    # Known critical security event IDs get elevated severity
    critical_ids = {"1102", "4697", "7045"}
    high_ids = {"4625", "4648", "4672", "4698", "4720", "4726", "4768", "4771", "4776", "4104"}
    
    if event_id in critical_ids:
        return "critical"
    if event_id in high_ids:
        return "high"
    if level_str in ("1",):      # Critical
        return "critical"
    elif level_str in ("2",):    # Error
        return "high"
    elif level_str in ("3",):    # Warning
        return "medium"
    else:                        # Info, Verbose
        return "low"

def collect_events(log_name: str, query: str = "*[System[TimeCreated[timediff(@SystemTime) <= 60000]]]") -> list:
    """Collect Windows Event Logs using wevtutil."""
    try:
        cmd = ['wevtutil', 'qe', log_name, f'/q:{query}', '/f:xml']
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            logging.error(f"Error executing wevtutil: {result.stderr}")
            return []
        
        # wevtutil qe with /f:xml outputs a sequence of Event elements, 
        # not a single root XML. We wrap it.
        xml_output = f"<Events>{result.stdout}</Events>"
        return parse_events(xml_output, log_name)
    except Exception as e:
        logging.error(f"Exception collecting events for {log_name}: {e}")
        return []

def parse_events(xml_str: str, source_log: str) -> list:
    """Parse XML events to standardize format."""
    events = []
    try:
        root = ET.fromstring(xml_str)
        ns = {"ns": "http://schemas.microsoft.com/win/2004/08/events/event"}
        
        for event in root.findall('ns:Event', ns):
            system = event.find('ns:System', ns)
            event_id = system.find('ns:EventID', ns).text
            level = system.find('ns:Level', ns).text
            time_created = system.find('ns:TimeCreated', ns).attrib.get('SystemTime', datetime.now(timezone.utc).isoformat())
            
            # Simple parsing for username / domain
            event_data = event.find('ns:EventData', ns)
            username = "N/A"
            if event_data is not None:
                for data in event_data.findall('ns:Data', ns):
                    if data.attrib.get('Name') == 'TargetUserName':
                        username = data.text
            
            mitre_info = MITRE_MAPPINGS.get(event_id, {})
            desc = mitre_info.get("desc", f"Event {event_id}")
            
            log_entry = {
                "timestamp": time_created,
                "source": f"Windows-{source_log}",
                "event_id": event_id,
                "severity": map_severity(level, event_id),
                "message": f"[{source_log}] {desc} (Event ID: {event_id}, User: {username})",
                "hostname": socket.gethostname(),
                "username": username,
                "raw_log": ET.tostring(event, encoding='unicode'),
                "mitre_tactics": [mitre_info["tactic"]] if "tactic" in mitre_info else [],
                "mitre_techniques": [mitre_info["technique"]] if "technique" in mitre_info else [],
            }
            events.append(log_entry)
            
    except ET.ParseError as e:
        logging.error(f"XML parsing error: {e}")
    except Exception as e:
        logging.error(f"Error parsing events: {e}")
        
    return events

def main():
    parser = argparse.ArgumentParser(description="Windows Event Log Collector for SOC Dashboard")
    parser.add_argument("--api-url", default="http://localhost:8001/api/logs/ingest", help="API Endpoint URL")
    parser.add_argument("--interval", type=int, default=60, help="Collection interval in seconds")
    parser.add_argument("--log-sources", nargs="+", default=["Security", "System"], help="Windows Event Logs to collect from")
    
    args = parser.parse_args()
    logging.info(f"Starting collector. Target API: {args.api_url}")
    
    while True:
        all_events = []
        for source in args.log_sources:
            # Query events from the last N seconds (represented in milliseconds)
            query_ms = args.interval * 1000
            query = f"*[System[TimeCreated[timediff(@SystemTime) <= {query_ms}]]]"
            logging.info(f"Collecting events from {source}...")
            
            events = collect_events(source, query)
            all_events.extend(events)
            
        if all_events:
            logging.info(f"Collected {len(all_events)} events. Shipping to API...")
            try:
                ingest_url = args.api_url if args.api_url.endswith('/api/logs/ingest') else args.api_url.rstrip('/') + '/api/logs/ingest'
                response = requests.post(ingest_url, json=all_events, timeout=10)
                if response.status_code == 200:
                    logging.info("Successfully shipped events.")
                else:
                    logging.error(f"Failed to ship events: HTTP {response.status_code} - {response.text}")
            except Exception as e:
                logging.error(f"Error shipping to API: {e}")
        else:
            logging.info("No events collected in this interval.")
            
        time.sleep(args.interval)

if __name__ == "__main__":
    main()

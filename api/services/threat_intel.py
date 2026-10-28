"""
api/services/threat_intel.py
============================
Threat Intelligence provider sync clients (ThreatFox, URLhaus, CISA KEV, AbuseIPDB, AlienVault OTX),
live IOC lookups, and feed indicators maintenance.
"""

import uuid
import csv
import io
import re
from datetime import datetime
import requests
from api.core.database import get_db
from api.services.settings import get_setting

OTX_BASE = "https://otx.alienvault.com/api/v1"

def upsert_feed_and_indicators(feed_name: str, feed_url: str, category: str, source_tag: str, indicators: list) -> str:
    """Upsert a community feed row and bulk-replace its indicators."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM threat_feeds WHERE url = %s", (feed_url,))
        row = cursor.fetchone()
        now = datetime.now().isoformat()
        if row:
            feed_id = row[0]
            cursor.execute(
                "UPDATE threat_feeds SET last_updated = %s, status = 'Active', indicator_count = %s WHERE id = %s",
                (now, len(indicators), feed_id)
            )
        else:
            feed_id = str(uuid.uuid4())
            cursor.execute(
                """INSERT INTO threat_feeds (id, name, url, type, category, status, indicator_count, schedule, last_updated)
                   VALUES (%s, %s, %s, 'Community', %s, 'Active', %s, 'Daily at 06:00', %s)""",
                (feed_id, feed_name, feed_url, category, len(indicators), now)
            )
        
        cursor.execute("DELETE FROM threat_indicators WHERE feed_id = %s", (feed_id,))
        if indicators:
            batch = []
            for ioc in indicators:
                batch.append((str(uuid.uuid4()), feed_id, ioc.get("type", "Unknown"), ioc.get("indicator", ""), ""))
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

def sync_threatfox() -> dict:
    """Sync ThreatFox (abuse.ch) IOCs via API or free daily CSV."""
    try:
        key = get_setting("THREATFOX_API_KEY")
        indicators = []

        if key:
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
            for item in data.get("data", []) or []:
                ioc_val = item.get("ioc_value", item.get("ioc", ""))
                ioc_type = item.get("ioc_type_desc", item.get("ioc_type", "Unknown"))
                if ioc_val:
                    indicators.append({"type": ioc_type, "indicator": ioc_val})
        else:
            resp = requests.get(
                "https://threatfox.abuse.ch/export/csv/recent/",
                timeout=60,
                headers={"User-Agent": "SOC-Dashboard/1.0"}
            )
            resp.raise_for_status()
            reader = csv.reader(io.StringIO(resp.text))
            for row in reader:
                if not row or row[0].startswith("#") or "ioc_value" in row[0]:
                    continue
                row = [c.strip().strip('"') for c in row]
                if len(row) < 4:
                    continue
                ioc_val = row[2] if len(row) > 2 else ""
                ioc_type = row[3] if len(row) > 3 else "Unknown"
                if ioc_val and ioc_val not in ("#", ""):
                    indicators.append({"type": ioc_type, "indicator": ioc_val})

        feed_id = upsert_feed_and_indicators(
            feed_name="ThreatFox — Recent IOCs",
            feed_url="community://threatfox",
            category="Malware IOCs",
            source_tag="threatfox",
            indicators=indicators
        )
        return {"status": "success", "feed_id": feed_id, "count": len(indicators)}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def sync_urlhaus() -> dict:
    """Sync URLhaus (abuse.ch) malicious URLs."""
    try:
        resp = requests.get("https://urlhaus.abuse.ch/downloads/csv_recent/", timeout=30)
        resp.raise_for_status()
        indicators = []
        for line in resp.text.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split(",")
            if len(parts) >= 3:
                url_val = parts[2].strip().strip('"')
                threat = parts[5].strip().strip('"') if len(parts) > 5 else "Malicious URL"
                if url_val.startswith("http"):
                    indicators.append({"type": threat or "Malicious URL", "indicator": url_val})
        feed_id = upsert_feed_and_indicators(
            feed_name="URLhaus — Recent Malicious URLs",
            feed_url="community://urlhaus",
            category="Malicious URLs",
            source_tag="urlhaus",
            indicators=indicators
        )
        return {"status": "success", "feed_id": feed_id, "count": len(indicators)}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def sync_cisa_kev() -> dict:
    """Sync CISA Known Exploited Vulnerabilities catalog."""
    try:
        resp = requests.get(
            "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
            timeout=30
        )
        resp.raise_for_status()
        data = resp.json()
        indicators = []
        for v in data.get("vulnerabilities", []):
            cve = v.get("cveID", "")
            if cve:
                indicators.append({"type": "CVE", "indicator": cve})
        feed_id = upsert_feed_and_indicators(
            feed_name="CISA KEV — Known Exploited Vulnerabilities",
            feed_url="community://cisa-kev",
            category="CVEs",
            source_tag="cisa-kev",
            indicators=indicators
        )
        return {"status": "success", "feed_id": feed_id, "count": len(indicators)}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def sync_abuseipdb() -> dict:
    """Sync high-confidence AbuseIPDB blocklist."""
    key = get_setting("ABUSEIPDB_API_KEY")
    if not key:
        return {"status": "error", "message": "ABUSEIPDB_API_KEY not configured in Settings."}
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
        entries = resp.json().get("data", [])
        indicators = [
            {"type": "IPv4", "indicator": e.get("ipAddress", "")}
            for e in entries if e.get("ipAddress")
        ]
        feed_id = upsert_feed_and_indicators(
            feed_name="AbuseIPDB — High-Confidence Blocklist",
            feed_url="community://abuseipdb",
            category="Malicious IPs",
            source_tag="abuseipdb",
            indicators=indicators
        )
        return {"status": "success", "feed_id": feed_id, "count": len(indicators)}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def otx_get(path: str, api_key: str, params: dict = None) -> dict:
    """Authenticated request to AlienVault OTX API."""
    url = OTX_BASE + path
    headers = {"X-OTX-API-KEY": api_key, "User-Agent": "SOC-Dashboard/1.0"}
    resp = requests.get(url, headers=headers, params=params or {}, timeout=(10, 60))
    resp.raise_for_status()
    return resp.json()

def extract_pulse_id(search_str: str) -> str:
    """Extract 24-character hexadecimal pulse ID from URL or raw string."""
    m = re.search(r'/pulses?/([a-f0-9]{24})', search_str)
    if m:
        return m.group(1)
    if re.match(r'^[a-f0-9]{24}$', search_str.strip()):
        return search_str.strip()
    return ""

def live_threat_lookup(ioc: str, ioc_type: str, provider: str = "VirusTotal") -> dict:
    """Query live threat intelligence providers for given indicator."""
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
            
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code == 200:
            attrs = resp.json().get("data", {}).get("attributes", {})
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
        elif resp.status_code == 404:
            return {"status": "error", "message": "IoC not found in VirusTotal"}
        return {"status": "error", "message": f"VirusTotal API returned {resp.status_code}"}
        
    return {"status": "error", "message": f"Provider '{provider}' not supported"}

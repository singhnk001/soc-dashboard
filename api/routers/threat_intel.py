"""
api/routers/threat_intel.py
===========================
Threat Intelligence feeds, community feed integrations, live lookup, and AlienVault OTX.
"""

import io
import csv
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from api.core.database import get_db
from api.models.threat_intel import FeedRequest, TIEnrichRequest
from api.services.settings import get_setting
from api.services.threat_intel import (
    sync_threatfox, sync_urlhaus, sync_cisa_kev, sync_abuseipdb,
    otx_get, extract_pulse_id, live_threat_lookup
)

router = APIRouter(tags=["Threat Intelligence"])

@router.get("/api/threat-feeds")
def get_threat_feeds():
    """List all configured threat intelligence feeds."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, url, type, category, status, last_updated, indicator_count, schedule FROM threat_feeds ORDER BY name")
        rows = cursor.fetchall()
        feeds = [{
            "id": r["id"], "name": r["name"], "url": r["url"], "type": r["type"],
            "category": r["category"], "status": r["status"], "last_updated": r["last_updated"],
            "indicator_count": r["indicator_count"], "schedule": r["schedule"] or "Daily"
        } for r in rows]
    return {"data": feeds}

@router.post("/api/threat-feeds")
def add_threat_feed(req: FeedRequest):
    """Add a new threat intelligence feed."""
    feed_id = str(uuid.uuid4())
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO threat_feeds (id, name, url, type, category, status, indicator_count, schedule) VALUES (%s, %s, %s, %s, %s, 'Active', 0, %s)",
            (feed_id, req.name, req.url, req.type, req.category, req.schedule)
        )
        conn.commit()
    return {"status": "success", "id": feed_id}

@router.put("/api/threat-feeds/{feed_id}")
def update_threat_feed(feed_id: str, req: FeedRequest):
    """Update feed configuration."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE threat_feeds SET name = %s, url = %s, type = %s, category = %s, schedule = %s WHERE id = %s",
            (req.name, req.url, req.type, req.category, req.schedule, feed_id)
        )
        conn.commit()
    return {"status": "success"}

@router.delete("/api/threat-feeds/{feed_id}")
def delete_threat_feed(feed_id: str):
    """Delete a threat feed and its associated indicators."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM threat_indicators WHERE feed_id = %s", (feed_id,))
        cursor.execute("DELETE FROM threat_feeds WHERE id = %s", (feed_id,))
        conn.commit()
    return {"status": "success"}

@router.get("/api/threat-feeds/{feed_id}/indicators")
def get_feed_indicators(feed_id: str, all: bool = False):
    """Retrieve indicators stored for a specific feed."""
    with get_db() as conn:
        cursor = conn.cursor()
        limit_clause = "" if all else " LIMIT 100"
        cursor.execute(
            "SELECT id, type, indicator FROM threat_indicators WHERE feed_id = %s AND indicator != 'indicator' ORDER BY type, indicator" + limit_clause,
            (feed_id,)
        )
        indicators = [{"id": r["id"], "type": r["type"], "indicator": r["indicator"]} for r in cursor.fetchall()]
    return {"data": indicators}

@router.delete("/api/threat-feeds/{feed_id}/indicators/{indicator_id}")
def delete_feed_indicator(feed_id: str, indicator_id: str):
    """Remove a specific indicator from a feed."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM threat_indicators WHERE id = %s AND feed_id = %s", (indicator_id, feed_id))
        cursor.execute("UPDATE threat_feeds SET indicator_count = (SELECT COUNT(*) FROM threat_indicators WHERE feed_id = %s) WHERE id = %s", (feed_id, feed_id))
        conn.commit()
    return {"status": "success"}

@router.get("/api/threat-feeds/{feed_id}/export")
def export_feed(feed_id: str):
    """Export feed indicators as a CSV file."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM threat_feeds WHERE id = %s", (feed_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Feed not found")
        feed_name = row["name"]
        
        cursor.execute(
            "SELECT type, indicator FROM threat_indicators WHERE feed_id = %s AND indicator != 'indicator'",
            (feed_id,)
        )
        rows = cursor.fetchall()
        
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_ALL)
    writer.writerow(["IoC Type", "Indicator"])
    for r in rows:
        writer.writerow([r["type"], r["indicator"]])
        
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={feed_name.replace(' ', '_')}_indicators.csv"}
    )

@router.post("/api/threat-feeds/{feed_id}/import")
async def import_feed_csv(feed_id: str, file: UploadFile = File(...)):
    """Import custom CSV file into threat indicators."""
    content = await file.read()
    text = content.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    count = 0
    with get_db() as conn:
        cursor = conn.cursor()
        for r in reader:
            clean_r = {k.strip(): v.strip() for k, v in r.items() if k}
            t = clean_r.get("IoC Type", clean_r.get("Indicator type", "Unknown"))
            ind = clean_r.get("Indicator", "")
            desc = clean_r.get("Description", "")
            if not ind or ind.lower() in ("indicator", ""):
                continue
            cursor.execute(
                "INSERT INTO threat_indicators (id, feed_id, type, indicator, description) VALUES (%s, %s, %s, %s, %s)",
                (str(uuid.uuid4()), feed_id, t, ind, desc)
            )
            count += 1
        cursor.execute("UPDATE threat_feeds SET indicator_count = (SELECT COUNT(*) FROM threat_indicators WHERE feed_id = %s) WHERE id = %s", (feed_id, feed_id))
        conn.commit()
    return {"status": "success", "imported": count}

@router.post("/api/threat-feeds/{feed_id}/sync")
def sync_feed(feed_id: str):
    """Synchronize a threat intelligence feed from its configured source."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT url FROM threat_feeds WHERE id = %s", (feed_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Feed not found")
        url = row["url"]

    if url.startswith("community://"):
        slug = url[len("community://"):]
        if slug == "threatfox":
            return sync_threatfox()
        elif slug == "urlhaus":
            return sync_urlhaus()
        elif slug == "cisa-kev":
            return sync_cisa_kev()
        elif slug == "abuseipdb":
            return sync_abuseipdb()
        return {"status": "error", "message": f"Unknown community feed: {slug}"}

    pulse_id = url[6:] if url.startswith("otx://") else extract_pulse_id(url)
    if pulse_id:
        otx_key = get_setting("OTX_API_KEY")
        if not otx_key:
            return {"status": "error", "message": "OTX API key not configured"}
        pulse = otx_get(f"/pulses/{pulse_id}", otx_key)
        indicators = pulse.get("indicators", [])
        now = datetime.now().isoformat()
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM threat_indicators WHERE feed_id = %s", (feed_id,))
            for ind in indicators:
                v = ind.get("indicator", "")
                if v:
                    cursor.execute(
                        "INSERT INTO threat_indicators (id, feed_id, type, indicator, description) VALUES (%s, %s, %s, %s, %s)",
                        (str(uuid.uuid4()), feed_id, ind.get("type", "Unknown"), v, ind.get("description", ""))
                    )
            cursor.execute("UPDATE threat_feeds SET indicator_count = %s, last_updated = %s, status = 'Active' WHERE id = %s", (len(indicators), now, feed_id))
            conn.commit()
        return {"status": "success", "count": len(indicators), "last_updated": now}

    return {"status": "error", "message": "Standard HTTP feeds not configured"}

@router.get("/api/threat-intel/lookup")
def threat_lookup(ioc: str, ioc_type: str, provider: str = "VirusTotal"):
    """Query live threat intelligence providers for given indicator."""
    return live_threat_lookup(ioc, ioc_type, provider)

@router.post("/api/community-feeds/{slug}/sync")
def sync_community_feed(slug: str):
    """Direct sync endpoint for community feeds."""
    slug_map = {
        "threatfox": sync_threatfox,
        "urlhaus": sync_urlhaus,
        "cisa-kev": sync_cisa_kev,
        "abuseipdb": sync_abuseipdb,
    }
    fn = slug_map.get(slug)
    if fn:
        return fn()
    raise HTTPException(status_code=404, detail=f"Community feed '{slug}' not found")

@router.get("/api/community-feeds/status")
def community_feeds_status():
    """Retrieve sync status and counts of built-in community feeds."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT url, last_updated, indicator_count, status FROM threat_feeds WHERE url LIKE 'community://%'")
        rows = cursor.fetchall()
        status_map = {r["url"][len("community://"):]: {
            "last_updated": r["last_updated"], "indicator_count": r["indicator_count"], "status": r["status"]
        } for r in rows}
    return {"status": "success", "data": status_map}

@router.get("/api/otx/status")
def otx_status():
    """Verify AlienVault OTX integration status."""
    key = get_setting("OTX_API_KEY")
    if not key:
        return {"configured": False, "message": "OTX API key not set"}
    try:
        data = otx_get("/user/me", key)
        return {"configured": True, "username": data.get("username"), "member_since": data.get("member_since")}
    except Exception as e:
        return {"configured": False, "message": str(e)}

@router.get("/api/otx/pulses")
def otx_list_pulses(page: int = 1, limit: int = 20, search: str = ""):
    """Browse or search subscribed AlienVault OTX pulses."""
    key = get_setting("OTX_API_KEY")
    if not key:
        raise HTTPException(status_code=400, detail="OTX_API_KEY not configured in Settings.")
    pulse_id = extract_pulse_id(search) if search else ""
    if pulse_id:
        try:
            return {"results": [otx_get(f"/pulses/{pulse_id}", key)], "count": 1}
        except Exception:
            return {"results": [], "count": 0}
    try:
        data = otx_get("/pulses/subscribed", key, {"limit": limit, "page": page})
        return {"results": data.get("results", []), "count": data.get("count", 0)}
    except Exception as e:
        return {"results": [], "error": str(e)}

@router.get("/api/otx/pulse/{pulse_id}")
def otx_get_pulse(pulse_id: str):
    """Retrieve full details of an OTX pulse."""
    key = get_setting("OTX_API_KEY")
    if not key:
        raise HTTPException(status_code=400, detail="OTX_API_KEY not configured.")
    return otx_get(f"/pulses/{pulse_id}", key)

@router.post("/api/ti/enrich")
def ti_enrich(req: TIEnrichRequest):
    """Enrich an IOC on-demand."""
    return live_threat_lookup(req.ioc, req.ioc_type, req.provider or "VirusTotal")

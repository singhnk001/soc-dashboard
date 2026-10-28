"""
api/services/settings.py
========================
System-wide key-value configuration retrieval and updates.
"""

import os
from api.core.database import get_db

ALLOWED_SETTING_KEYS = {
    "OTX_API_KEY", "VIRUSTOTAL_API_KEY", "IBM_XFORCE_KEY", "IBM_XFORCE_PASS",
    "TALOS_API_KEY", "ABUSEIPDB_API_KEY", "CISCO_TALOS_KEY", "THREATFOX_API_KEY",
    "SLACK_WEBHOOK_URL", "TEAMS_WEBHOOK_URL"
}

def get_setting(key: str, default: str = "") -> str:
    """Retrieve setting from database with environment variable fallback."""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = %s", (key,))
            row = cursor.fetchone()
            if row and row[0]:
                return row[0]
    except Exception:
        pass
    return os.environ.get(key, default)

def set_setting(key: str, value: str):
    """Upsert setting into database."""
    if key not in ALLOWED_SETTING_KEYS:
        return
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            (key, value)
        )
        conn.commit()

def get_masked_settings() -> dict:
    """Returns all settings with API keys masked for frontend display."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM settings")
        rows = cursor.fetchall()
        data = {k: v for k, v in rows}
        
    for key in ALLOWED_SETTING_KEYS:
        if key not in data and os.environ.get(key):
            data[key] = os.environ.get(key)
            
    masked = {}
    for k, v in data.items():
        if v and len(v) > 8:
            masked[k] = v[:4] + "*" * (len(v) - 8) + v[-4:]
        elif v:
            masked[k] = "***"
        else:
            masked[k] = ""
    return masked

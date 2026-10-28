"""
api/routers/mitre.py
====================
MITRE ATT&CK technique and tactic mapping endpoints.
"""

from typing import Optional
from fastapi import APIRouter
from api.core.database import get_db

router = APIRouter(tags=["MITRE ATT&CK"])

@router.get("/api/mitre/mappings")
def get_mitre_mappings(platform: Optional[str] = None):
    """Retrieve event ID to MITRE ATT&CK technique/tactic relations."""
    with get_db() as conn:
        cursor = conn.cursor()
        if platform:
            cursor.execute("SELECT * FROM mitre_mappings WHERE platform = %s ORDER BY tactic_id", (platform,))
        else:
            cursor.execute("SELECT * FROM mitre_mappings ORDER BY tactic_id")
        rows = cursor.fetchall()
    return [dict(r) for r in rows]

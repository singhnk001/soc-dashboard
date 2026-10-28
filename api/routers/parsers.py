"""
api/routers/parsers.py
======================
Custom regex log parsers for syslog, firewalls, and custom telemetry.
"""

import uuid
from fastapi import APIRouter
from api.core.database import get_db
from api.models.parser import ParserCreate

router = APIRouter(tags=["Log Parsers"])

@router.get("/api/parsers")
def get_parsers():
    """Retrieve all defined regex log parsers."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM parsers ORDER BY name ASC")
        rows = cursor.fetchall()
    return [dict(r) for r in rows]

@router.post("/api/parsers")
def create_parser(parser: ParserCreate):
    """Register a new regex parser with target log source."""
    parser_id = str(uuid.uuid4())
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO parsers (id, name, regex, description, active, log_source)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (parser_id, parser.name, parser.regex, parser.description, parser.active, parser.log_source or "generic"))
        conn.commit()
    return {"id": parser_id, "status": "created"}

@router.delete("/api/parsers/{parser_id}")
def delete_parser(parser_id: str):
    """Delete a log parser."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM parsers WHERE id = %s", (parser_id,))
        conn.commit()
    return {"status": "deleted"}

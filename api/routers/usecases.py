"""
api/routers/usecases.py
=======================
Correlation detection rules and baseline use cases.
"""

import uuid
from fastapi import APIRouter
from api.core.database import get_db
from api.models.usecase import UseCaseCreate
from api.correlation import engine as correlation_engine

router = APIRouter(tags=["Detection Rules & Use Cases"])

@router.get("/api/usecases")
def get_usecases():
    """Retrieve all defined detection use cases."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM use_cases ORDER BY title ASC")
        rows = cursor.fetchall()
    return [dict(r) for r in rows]

@router.post("/api/usecases")
def create_usecase(uc: UseCaseCreate):
    """Create a new match or threshold correlation rule."""
    uc_id = f"UC-{str(uuid.uuid4())[:8].upper()}"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO use_cases (id, title, description, type, event_id, mitre_technique, threshold_count, severity, active, rule_logic)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            uc_id, uc.title, uc.description, uc.type, uc.event_id,
            uc.mitre_technique, uc.threshold_count, uc.severity, uc.active, uc.rule_logic
        ))
        conn.commit()
    # Refresh engine in memory
    try:
        correlation_engine.refresh()
    except Exception:
        pass
    return {"id": uc_id, "status": "created"}

@router.delete("/api/usecases/{uc_id}")
def delete_usecase(uc_id: str):
    """Delete a detection use case."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM use_cases WHERE id = %s", (uc_id,))
        conn.commit()
    try:
        correlation_engine.refresh()
    except Exception:
        pass
    return {"status": "deleted"}

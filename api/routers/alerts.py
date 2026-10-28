"""
api/routers/alerts.py
=====================
Alert management, triage lifecycle, investigation notes, and analyst comments.
"""

import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from api.core.database import get_db
from api.models.alert import AlertCreate, StatusUpdate, AlertCommentRequest

router = APIRouter(tags=["Alerts"])

@router.get("/api/alerts")
def get_alerts(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    """Retrieve alerts with pagination and status/severity filters."""
    conditions = []
    params: list = []

    if status and status.lower() != "all":
        conditions.append("status = %s")
        params.append(status)
    if severity and severity.lower() != "all":
        conditions.append("severity = %s")
        params.append(severity)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM alerts {where}", params)
        total = cur.fetchone()["count"]

        offset = (page - 1) * limit
        cur.execute(
            f"SELECT * FROM alerts {where} ORDER BY timestamp DESC LIMIT %s OFFSET %s",
            params + [limit, offset]
        )
        rows = cur.fetchall()

    return {
        "data": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "limit": limit,
    }

@router.post("/api/alerts")
def create_alert(alert: AlertCreate):
    """Create manual alert."""
    alert_id = str(uuid.uuid4())
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO alerts (id, timestamp, title, description, severity, status, source, event_id, mitre_ref, raw_log, extracted_fields)
            VALUES (%s, %s, %s, %s, %s, 'new', %s, %s, %s, %s, %s)
        """, (
            alert_id, datetime.now().isoformat(), alert.title,
            alert.description, alert.severity, alert.source,
            alert.event_id, alert.mitre_ref, None, None,
        ))
        conn.commit()
    return {"id": alert_id, "status": "created"}

@router.patch("/api/alerts/{alert_id}")
def update_alert_status(alert_id: str, update: StatusUpdate):
    """Update status, assignment, resolution type, and investigation notes of an alert."""
    fields = ["updated_at = CURRENT_TIMESTAMP"]
    params = []

    if update.status is not None:
        fields.append("status = %s")
        params.append(update.status)
    if update.resolution_type is not None:
        fields.append("resolution_type = %s")
        params.append(update.resolution_type)
    if update.assigned_to is not None:
        fields.append("assigned_to = %s")
        params.append(update.assigned_to)
    if update.notes is not None:
        fields.append("notes = %s")
        params.append(update.notes)

    if not params:
        return {"success": True}

    params.append(alert_id)
    with get_db() as conn:
        cursor = conn.execute(f"UPDATE alerts SET {', '.join(fields)} WHERE id = %s", params)
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Alert not found")
        if update.notes:
            comment_id = str(uuid.uuid4())
            conn.execute(
                'INSERT INTO alert_comments (id, alert_id, "user", comment) VALUES (%s, %s, %s, %s)', 
                (comment_id, alert_id, "System", f"Alert updated: {update.notes}")
            )
        conn.commit()
    return {"success": True}

@router.get("/api/alerts/{alert_id}/comments")
def get_alert_comments(alert_id: str):
    """Retrieve analyst comments on an alert."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            'SELECT id, "user", comment, created_at FROM alert_comments WHERE alert_id = %s ORDER BY created_at ASC',
            (alert_id,)
        )
        rows = cursor.fetchall()
    return {
        "data": [{"id": r["id"], "user": r["user"], "comment": r["comment"], "created_at": r["created_at"]} for r in rows]
    }

@router.post("/api/alerts/{alert_id}/comments")
def add_alert_comment(alert_id: str, req: AlertCommentRequest):
    """Add a new comment or investigation note to an alert."""
    comment_id = str(uuid.uuid4())
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO alert_comments (id, alert_id, "user", comment) VALUES (%s, %s, %s, %s)',
            (comment_id, alert_id, req.user, req.comment)
        )
        conn.commit()
    return {"status": "success", "id": comment_id}

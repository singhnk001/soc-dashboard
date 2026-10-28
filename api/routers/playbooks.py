"""
api/routers/playbooks.py
========================
SOAR Playbook management, manual trigger testing, and execution audit history.
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from api.core.database import get_db
from api.models.playbook import PlaybookCreate, PlaybookUpdate
from api.playbook_engine import execute_playbook

router = APIRouter(tags=["SOAR Playbooks"])

@router.get("/api/playbooks")
def get_playbooks():
    """Retrieve all defined response playbooks."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, description, enabled, trigger_severity, trigger_keyword, actions, created_at, updated_at FROM playbooks ORDER BY created_at DESC"
        )
        rows = cursor.fetchall()
        result = []
        for r in rows:
            try:
                actions = json.loads(r["actions"]) if r["actions"] else []
            except Exception:
                actions = []
            result.append({
                "id": r["id"], "name": r["name"], "description": r["description"],
                "enabled": r["enabled"], "trigger_severity": r["trigger_severity"], "trigger_keyword": r["trigger_keyword"],
                "actions": actions, "created_at": r["created_at"], "updated_at": r["updated_at"],
            })
    return result

@router.post("/api/playbooks")
def create_playbook(pb: PlaybookCreate):
    """Create a new automated response playbook."""
    pb_id = str(uuid.uuid4())
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO playbooks (id, name, description, enabled, trigger_severity, trigger_keyword, actions)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (pb_id, pb.name, pb.description, pb.enabled,
             pb.trigger_severity, pb.trigger_keyword, json.dumps(pb.actions))
        )
        conn.commit()
    return {"status": "success", "id": pb_id}

@router.patch("/api/playbooks/{pb_id}")
def update_playbook(pb_id: str, pb: PlaybookUpdate):
    """Update playbook configuration or active actions."""
    updates, params = [], []
    if pb.name is not None:
        updates.append("name = %s")
        params.append(pb.name)
    if pb.description is not None:
        updates.append("description = %s")
        params.append(pb.description)
    if pb.enabled is not None:
        updates.append("enabled = %s")
        params.append(pb.enabled)
    if pb.trigger_severity is not None:
        updates.append("trigger_severity = %s")
        params.append(pb.trigger_severity)
    if pb.trigger_keyword is not None:
        updates.append("trigger_keyword = %s")
        params.append(pb.trigger_keyword)
    if pb.actions is not None:
        updates.append("actions = %s")
        params.append(json.dumps(pb.actions))

    if not updates:
        return {"status": "no_change"}

    updates.append("updated_at = NOW()")
    params.append(pb_id)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE playbooks SET {', '.join(updates)} WHERE id = %s", params)
        conn.commit()
    return {"status": "success"}

@router.delete("/api/playbooks/{pb_id}")
def delete_playbook(pb_id: str):
    """Delete a response playbook."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM playbooks WHERE id = %s", (pb_id,))
        conn.commit()
    return {"status": "success"}

@router.post("/api/playbooks/{pb_id}/test")
def test_playbook(pb_id: str, alert_id: Optional[str] = None):
    """Test fire a playbook against an existing or synthetic alert context."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, description, enabled, trigger_severity, trigger_keyword, actions FROM playbooks WHERE id = %s",
            (pb_id,)
        )
        pb_row = cursor.fetchone()
        if not pb_row:
            raise HTTPException(status_code=404, detail="Playbook not found")

        pb_dict = {
            "id": pb_row["id"], "name": pb_row["name"], "description": pb_row["description"],
            "enabled": True,
            "trigger_severity": pb_row["trigger_severity"], "trigger_keyword": pb_row["trigger_keyword"],
            "actions": pb_row["actions"],
        }

        alert_obj = None
        if alert_id:
            cursor.execute(
                "SELECT id, title, severity, source, timestamp, raw_log FROM alerts WHERE id = %s",
                (alert_id,)
            )
            a = cursor.fetchone()
            if a:
                alert_obj = {
                    "id": a["id"], "title": a["title"], "severity": a["severity"],
                    "source": a["source"], "timestamp": str(a["timestamp"]), "raw_log": a["raw_log"] or "",
                }

        if not alert_obj:
            alert_obj = {
                "id": "test-" + str(uuid.uuid4()),
                "title": f"[TEST] Manual trigger of playbook: {pb_row['name']}",
                "severity": pb_row["trigger_severity"],
                "source": "manual-test",
                "hostname": "DESKTOP-3BEJ849",
                "username": "TestUser",
                "src_ip": "203.0.113.42",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "description": "Manually triggered test execution",
                "raw_log": "",
            }

        exec_id = execute_playbook(pb_dict, alert_obj, conn)
        cursor.execute(
            "SELECT id, status, results, triggered_at FROM playbook_executions WHERE id = %s",
            (exec_id,)
        )
        exec_row = cursor.fetchone()

    results = []
    if exec_row and exec_row["results"]:
        try:
            results = json.loads(exec_row["results"])
        except Exception:
            pass

    return {
        "execution_id": exec_id,
        "status": exec_row["status"] if exec_row else "unknown",
        "results": results,
    }

@router.get("/api/playbooks/executions")
def get_executions(limit: int = Query(50, ge=1, le=200)):
    """Retrieve audit history of playbook runs."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT pe.id, pe.playbook_id, p.name as playbook_name, pe.alert_id, pe.triggered_at,
                   pe.status, pe.results, pe.error
            FROM playbook_executions pe
            LEFT JOIN playbooks p ON pe.playbook_id = p.id
            ORDER BY pe.triggered_at DESC
            LIMIT %s
        """, (limit,))
        rows = cursor.fetchall()
        result = []
        for r in rows:
            try:
                res = json.loads(r["results"]) if r["results"] else []
            except Exception:
                res = []
            result.append({
                "id": r["id"], "playbook_id": r["playbook_id"], "playbook_name": r["playbook_name"] or "Unknown",
                "alert_id": r["alert_id"], "triggered_at": r["triggered_at"], "status": r["status"],
                "results": res, "error": r["error"]
            })
    return result

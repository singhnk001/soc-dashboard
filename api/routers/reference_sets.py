"""
api/routers/reference_sets.py
=============================
Reference sets (watchlists) for IP, Domain, Hash, Port, and User indicators.
"""

import uuid
from fastapi import APIRouter
from api.core.database import get_db
from api.models.reference_set import (
    ReferenceSetRequest, ReferenceSetItemRequest, ReferenceSetBulkRequest
)

router = APIRouter(tags=["Reference Sets"])

@router.get("/api/reference-sets")
def get_reference_sets():
    """Retrieve all watchlists with current item counts."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, type, description, ttl_days FROM reference_sets ORDER BY name ASC")
        rows = cursor.fetchall()
        sets = [{"id": r["id"], "name": r["name"], "type": r["type"], "description": r["description"], "ttl_days": r["ttl_days"]} for r in rows]
        for s in sets:
            cursor.execute("SELECT COUNT(*) FROM reference_set_items WHERE set_id = %s", (s["id"],))
            s["count"] = cursor.fetchone()[0]
    return {"data": sets}

@router.post("/api/reference-sets")
def create_reference_set(req: ReferenceSetRequest):
    """Create a new watchlist."""
    set_id = str(uuid.uuid4())
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO reference_sets (id, name, type, description, ttl_days) VALUES (%s, %s, %s, %s, %s)",
            (set_id, req.name, req.type, req.description, req.ttl_days)
        )
        conn.commit()
    return {"status": "success", "id": set_id}

@router.delete("/api/reference-sets/{set_id}")
def delete_reference_set(set_id: str):
    """Delete a watchlist and all associated elements."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM reference_sets WHERE id = %s", (set_id,))
        conn.commit()
    return {"status": "success"}

@router.get("/api/reference-sets/{set_id}/items")
def get_reference_set_items(set_id: str):
    """Retrieve items within a watchlist."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, value, added_by, added_at FROM reference_set_items WHERE set_id = %s ORDER BY added_at DESC",
            (set_id,)
        )
        items = [{"id": r["id"], "value": r["value"], "added_by": r["added_by"], "added_at": r["added_at"]} for r in cursor.fetchall()]
    return {"data": items}

@router.post("/api/reference-sets/{set_id}/items")
def add_reference_set_item(set_id: str, req: ReferenceSetItemRequest):
    """Add a single item to a watchlist."""
    item_id = str(uuid.uuid4())
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO reference_set_items (id, set_id, value, added_by) VALUES (%s, %s, %s, %s)",
            (item_id, set_id, req.value.strip(), req.added_by or "Administrator")
        )
        conn.commit()
    return {"status": "success", "id": item_id}

@router.post("/api/reference-sets/{set_id}/bulk-items")
def add_reference_set_bulk(set_id: str, req: ReferenceSetBulkRequest):
    """Bulk import indicators into a watchlist."""
    with get_db() as conn:
        cursor = conn.cursor()
        batch = [
            (str(uuid.uuid4()), set_id, val.strip(), req.added_by or "Administrator")
            for val in req.values if val.strip()
        ]
        if batch:
            cursor.executemany("INSERT INTO reference_set_items (id, set_id, value, added_by) VALUES (%s, %s, %s, %s)", batch)
            conn.commit()
    return {"status": "success", "count": len(batch)}

@router.delete("/api/reference-sets/{set_id}/items/{item_id}")
def delete_reference_set_item(set_id: str, item_id: str):
    """Remove an item from a watchlist."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM reference_set_items WHERE id = %s", (item_id,))
        conn.commit()
    return {"status": "success"}

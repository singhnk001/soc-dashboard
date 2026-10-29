"""
api/models/alert.py
===================
Schemas for alert triage, comments, and lifecycle updates.
"""

from typing import Optional
from pydantic import BaseModel

class AlertCreate(BaseModel):
    title: str
    description: str
    severity: str = "medium"
    source: str
    event_id: Optional[str] = None
    mitre_ref: Optional[str] = None

class StatusUpdate(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    resolution_type: Optional[str] = None
    notes: Optional[str] = None

class BulkAlertUpdate(BaseModel):
    alert_ids: list[str]
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    resolution_type: Optional[str] = None
    notes: Optional[str] = None

class AlertCommentRequest(BaseModel):
    user: str
    comment: str

"""
api/models/usecase.py
=====================
Schemas for detection rules and correlation use cases.
"""

from typing import Optional
from pydantic import BaseModel

class UseCaseCreate(BaseModel):
    title: str
    description: Optional[str] = None
    type: str  # match or threshold
    event_id: Optional[str] = None
    mitre_technique: Optional[str] = None
    threshold_count: Optional[int] = 5
    rule_logic: Optional[str] = None
    severity: str = "medium"
    active: bool = True

"""
api/models/reference_set.py
===========================
Schemas for Reference Sets (watchlists) and items.
"""

from typing import Optional, List
from pydantic import BaseModel

class ReferenceSetRequest(BaseModel):
    name: str
    type: str  # IP, Domain, Hash, Port, User
    description: Optional[str] = ""
    ttl_days: Optional[int] = 0

class ReferenceSetItemRequest(BaseModel):
    value: str
    added_by: Optional[str] = "admin"

class ReferenceSetBulkRequest(BaseModel):
    values: List[str]
    added_by: Optional[str] = "admin"

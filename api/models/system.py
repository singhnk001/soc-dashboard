"""
api/models/system.py
====================
Schemas for system health, Windows services, host endpoints, and API sources.
"""

from typing import Optional
from pydantic import BaseModel

class ServiceActionRequest(BaseModel):
    action: str  # start, stop, restart

class DeviceCriticalityRequest(BaseModel):
    criticality: str  # low, medium, high, critical

class ApiSourceCreate(BaseModel):
    type: str
    name: str
    config: str

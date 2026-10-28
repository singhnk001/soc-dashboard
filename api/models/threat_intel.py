"""
api/models/threat_intel.py
==========================
Schemas for Threat Intelligence feeds, indicators, and live enrichment.
"""

from typing import Optional
from pydantic import BaseModel

class FeedRequest(BaseModel):
    name: str
    url: str
    type: str = "CSV"
    category: str = "IP"
    schedule: str = "Daily at 00:00 AM"

class TIEnrichRequest(BaseModel):
    ioc: str
    ioc_type: str = "ip"
    provider: Optional[str] = "VirusTotal"

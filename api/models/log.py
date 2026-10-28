"""
api/models/log.py
=================
Schemas for log ingestion, querying, and retention.
"""

from typing import Optional, Dict, Any, List
from pydantic import BaseModel

class LogEntry(BaseModel):
    timestamp: str
    source: str
    event_id: Optional[str] = None
    severity: str = "info"
    message: str
    hostname: str
    username: Optional[str] = None
    raw_log: Optional[str] = None
    extracted_fields: Optional[Dict[str, Any]] = None
    source_ip: Optional[str] = None
    destination_ip: Optional[str] = None
    log_type: Optional[str] = None
    mitre_tactics: Optional[List[str]] = None
    mitre_techniques: Optional[List[str]] = None

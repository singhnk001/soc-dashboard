"""
api/models/playbook.py
======================
Schemas for SOAR playbooks and actions.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel

class PlaybookAction(BaseModel):
    name: str
    type: str  # slack, teams, webhook, disable_ad_user, block_ip_windows, block_ip_pfsense, email
    webhook_url: Optional[str] = None
    domain: Optional[str] = None
    pfsense_url: Optional[str] = None
    api_key: Optional[str] = None
    alias_name: Optional[str] = "SOC_Blocked_IPs"
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = 587
    smtp_user: Optional[str] = None
    smtp_pass: Optional[str] = None
    to: Optional[str] = None

class PlaybookCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    enabled: bool = True
    trigger_severity: str = "critical"
    trigger_keyword: Optional[str] = None
    actions: List[Dict[str, Any]] = []

class PlaybookUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    trigger_severity: Optional[str] = None
    trigger_keyword: Optional[str] = None
    actions: Optional[List[Dict[str, Any]]] = None

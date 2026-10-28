"""
api/models/parser.py
====================
Schemas for custom regex log parsers.
"""

from typing import Optional
from pydantic import BaseModel

class ParserCreate(BaseModel):
    name: str
    regex: str
    description: Optional[str] = None
    log_source: Optional[str] = None
    active: bool = True

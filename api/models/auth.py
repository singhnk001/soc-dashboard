"""
api/models/auth.py
==================
Schemas for authentication, session verification, user management, and MFA.
"""

from typing import Optional
from pydantic import BaseModel

class LoginRequest(BaseModel):
    username: str
    password: str

class MFALoginRequest(BaseModel):
    user_id: str
    token: Optional[str] = None
    code: Optional[str] = None

    @property
    def totp_token(self) -> str:
        return self.token or self.code or ""

class MFASetupRequest(BaseModel):
    user_id: str

class MFAVerifyRequest(BaseModel):
    user_id: str
    secret: str
    token: Optional[str] = None
    code: Optional[str] = None

    @property
    def totp_token(self) -> str:
        return self.token or self.code or ""

class MFAResetRequest(BaseModel):
    user_id: str

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "analyst"
    real_name: Optional[str] = ""

class UserUpdate(BaseModel):
    role: Optional[str] = None
    real_name: Optional[str] = None
    status: Optional[str] = None
    password: Optional[str] = None

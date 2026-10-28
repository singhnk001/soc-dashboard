"""
api/routers/auth.py
===================
Authentication endpoints, TOTP MFA challenge & setup, and user management.
"""

import uuid
import pyotp
import psycopg
from fastapi import APIRouter, HTTPException
from api.core.database import get_db
from api.models.auth import (
    LoginRequest, MFALoginRequest, MFASetupRequest,
    MFAVerifyRequest, MFAResetRequest, UserCreate, UserUpdate
)

router = APIRouter(tags=["Authentication & Users"])

@router.post("/api/auth/login")
def login(req: LoginRequest):
    # Built-in demo user with read-only privileges
    if req.username.lower() in ("demo", "demouser") and req.password in ("demo123", "demo"):
        return {
            "status": "success",
            "user": {
                "id": "demo-readonly-account",
                "username": "demo",
                "role": "readonly",
                "status": "Active",
                "real_name": "Demo Analyst (Read-Only)",
                "mfa_enabled": False
            }
        }

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username, role, status, real_name, mfa_secret FROM users WHERE username ILIKE %s AND password = %s",
            (req.username, req.password)
        )
        user = cursor.fetchone()
        
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user["status"] != 'Active':
        raise HTTPException(status_code=403, detail="Account disabled")
        
    user_dict = dict(user)
    mfa_secret = user_dict.pop("mfa_secret", None)
    user_dict["mfa_enabled"] = bool(mfa_secret)
    if mfa_secret:
        return {"status": "mfa_required", "user_id": user_dict["id"]}
    return {"status": "success", "user": user_dict}

@router.post("/api/auth/login/mfa")
def login_mfa(req: MFALoginRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, role, status, real_name, mfa_secret FROM users WHERE id = %s", (req.user_id,))
        user = cursor.fetchone()
        
    if user and user.get("mfa_secret"):
        totp = pyotp.TOTP(user["mfa_secret"])
        token_val = req.totp_token
        if token_val and totp.verify(token_val):
            user_dict = dict(user)
            user_dict.pop("mfa_secret", None)
            user_dict["mfa_enabled"] = True
            return {"status": "success", "user": user_dict}
        raise HTTPException(status_code=401, detail="Invalid MFA code")
    raise HTTPException(status_code=401, detail="User not found or MFA not enabled")

@router.post("/api/auth/mfa/setup")
def mfa_setup(req: MFASetupRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT username FROM users WHERE id = %s", (req.user_id,))
        user = cursor.fetchone()
        
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=user["username"], issuer_name="SOC Dashboard")
    return {"status": "success", "secret": secret, "uri": uri}

@router.post("/api/auth/mfa/verify")
def mfa_verify(req: MFAVerifyRequest):
    token_val = req.totp_token
    if not token_val:
        raise HTTPException(status_code=400, detail="Missing verification code")
    totp = pyotp.TOTP(req.secret)
    if not totp.verify(token_val):
        raise HTTPException(status_code=400, detail="Invalid verification code")
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET mfa_secret = %s WHERE id = %s", (req.secret, req.user_id))
        conn.commit()
    return {"status": "success"}

@router.post("/api/auth/mfa/reset")
def mfa_reset(req: MFAResetRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET mfa_secret = NULL WHERE id = %s", (req.user_id,))
        conn.commit()
    return {"status": "success"}

@router.get("/api/users")
def get_users():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, role, status, real_name FROM users ORDER BY username ASC")
        rows = cursor.fetchall()
    return [{"id": r["id"], "username": r["username"], "role": r["role"], "status": r["status"], "real_name": r["real_name"] or r["username"]} for r in rows]

@router.post("/api/users")
def create_user(user: UserCreate):
    user_id = str(uuid.uuid4())
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO users (id, username, password, role, real_name) VALUES (%s, %s, %s, %s, %s)", 
                (user_id, user.username, user.password, user.role, user.real_name or user.username)
            )
            conn.commit()
        return {"id": user_id, "username": user.username, "role": user.role, "status": "Active", "real_name": user.real_name}
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=400, detail="Username already exists")

@router.patch("/api/users/{user_id}")
def update_user(user_id: str, user: UserUpdate):
    updates = []
    params = []
    if user.password:
        updates.append("password = %s")
        params.append(user.password)
    if user.role:
        updates.append("role = %s")
        params.append(user.role)
    if user.status:
        updates.append("status = %s")
        params.append(user.status)
    if user.real_name is not None:
        updates.append("real_name = %s")
        params.append(user.real_name)
        
    if updates:
        params.append(user_id)
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = %s", params)
            conn.commit()
    return {"success": True}

@router.delete("/api/users/{user_id}")
def delete_user(user_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
    return {"success": True}

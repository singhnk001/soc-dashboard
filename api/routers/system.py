"""
api/routers/system.py
=====================
Host system health, Windows services control, and global application settings.
"""

import os
import subprocess
import psutil
from fastapi import APIRouter, HTTPException
from api.models.system import ServiceActionRequest
from api.services.system import get_services_status, get_system_health
from api.services.settings import get_masked_settings, set_setting, ALLOWED_SETTING_KEYS
from api.core.database import get_db

router = APIRouter(tags=["System & Health"])

@router.get("/api/system/services")
def list_services():
    """Retrieve process and operational status for all managed services."""
    return {"data": get_services_status()}

@router.post("/api/system/services/{service_id}/action")
def manage_service(service_id: str, req: ServiceActionRequest):
    """Start, stop, or restart a system service."""
    services = get_services_status()
    service = next((s for s in services if s["id"] == service_id), None)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    action = req.action.lower()

    # Stop phase
    if action in ["stop", "restart"]:
        if service_id == "vector-agent":
            try:
                subprocess.run(["sc.exe", "stop", "VectorAgent"], capture_output=True, timeout=8)
            except Exception:
                pass
            try:
                subprocess.run(["taskkill", "/F", "/IM", "vector.exe"], capture_output=True, timeout=8)
            except Exception:
                pass
        elif service.get("pid"):
            try:
                p = psutil.Process(service["pid"])
                p.terminate()
                p.wait(timeout=3)
            except Exception:
                try:
                    psutil.Process(service["pid"]).kill()
                except Exception:
                    pass

    if action == "stop":
        return {"status": "success", "message": f"{service['name']} stopped"}

    # Start phase
    if action in ["start", "restart"]:
        try:
            if service_id == "frontend":
                subprocess.Popen(
                    ["npm", "run", "dev"], shell=True,
                    creationflags=subprocess.DETACHED_PROCESS if os.name == 'nt' else 0
                )
            elif service_id == "vector-agent":
                already_running = any(
                    (p.info.get('name') or "").lower() in ("vector.exe", "vector")
                    for p in psutil.process_iter(['name'])
                )
                if already_running:
                    return {"status": "success", "message": "Vector Log Agent is already running"}

                svc_started = False
                try:
                    result = subprocess.run(["sc.exe", "start", "VectorAgent"], capture_output=True, timeout=10)
                    out = (result.stdout or b"").decode(errors="replace")
                    if result.returncode == 0 or "1056" in out or "already running" in out.lower():
                        svc_started = True
                except Exception:
                    pass

                if not svc_started:
                    VECTOR_EXE = r"D:\SOC-Dashboard\Dashboard\vector\bin\vector.exe"
                    VECTOR_CFG = r"D:\SOC-Dashboard\Dashboard\vector\vector-soc-collector.toml"
                    if os.path.exists(VECTOR_EXE):
                        subprocess.Popen(
                            [VECTOR_EXE, "--config", VECTOR_CFG],
                            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL, close_fds=True
                        )

            return {"status": "success", "message": f"{service['name']} started"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return {"status": "error", "message": "Invalid action"}

@router.get("/api/system/health")
def system_health_status():
    """Retrieve host system metrics (CPU, RAM, Network interfaces)."""
    return get_system_health()

@router.get("/api/health")
def health_check():
    """Health check ping returning system operational summary."""
    try:
        with get_db() as conn:
            cnt = conn.execute("SELECT COUNT(*) FROM logs").fetchone()[0]
        return {"status": "ok", "total_logs": cnt}
    except Exception as e:
        return {"status": "degraded", "error": str(e)}

@router.get("/api/settings")
def get_settings():
    """Retrieve masked API configuration settings."""
    return {"status": "success", "data": get_masked_settings()}

@router.post("/api/settings")
def save_settings(payload: dict):
    """Save API keys and integrations."""
    for k, v in payload.items():
        if k in ALLOWED_SETTING_KEYS and v and "*" not in v:
            set_setting(k, v)
    return {"status": "success"}

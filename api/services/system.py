"""
api/services/system.py
======================
Hardware monitoring, Windows services status, and system health checks.
"""

import os
import subprocess
import psutil

def get_windows_service_status(svc_name: str) -> dict:
    """Query a Windows service via sc.exe. Returns status, pid, start_type."""
    result = {"status": "stopped", "pid": None, "start_type": "unknown"}
    try:
        out = subprocess.check_output(
            ["sc.exe", "query", svc_name], stderr=subprocess.DEVNULL, timeout=4
        ).decode(errors="replace")
        if "RUNNING" in out:
            result["status"] = "running"
            try:
                out2 = subprocess.check_output(
                    ["sc.exe", "qc", svc_name], stderr=subprocess.DEVNULL, timeout=4
                ).decode(errors="replace")
                result["start_type"] = "automatic" if "AUTO_START" in out2 else "manual"
            except Exception:
                pass
            try:
                tl = subprocess.check_output(
                    ["tasklist", "/FI", "IMAGENAME eq vector.exe", "/FO", "CSV", "/NH"],
                    stderr=subprocess.DEVNULL, timeout=4
                ).decode(errors="replace")
                for line in tl.strip().splitlines():
                    parts = line.strip('"').split('","')
                    if len(parts) >= 2:
                        try:
                            result["pid"] = int(parts[1])
                        except ValueError:
                            pass
                        break
            except Exception:
                pass
        elif "STOPPED" in out:
            result["status"] = "stopped"
        elif "1060" in out or "does not exist" in out.lower():
            result["status"] = "not_installed"
    except Exception:
        result["status"] = "not_installed"
    return result

def get_services_status() -> list:
    """Retrieve operational status of Core API, Frontend, and Vector Agent."""
    services = [
        {"id": "api-server",   "name": "Core API Server",    "type": "backend",   "command": "uvicorn api.index:app", "status": "stopped", "pid": None, "started_at": None},
        {"id": "frontend",     "name": "Next.js UI Server",  "type": "frontend",  "command": "next",                  "status": "stopped", "pid": None, "started_at": None},
        {"id": "vector-agent", "name": "Vector Log Agent",   "type": "collector", "command": "VectorAgent",           "status": "stopped", "pid": None, "started_at": None,
         "service_name": "VectorAgent", "description": "Windows Event Log collector (auto-starts on reboot)"},
    ]

    try:
        for p in psutil.process_iter(['pid', 'name', 'cmdline', 'create_time', 'memory_info']):
            try:
                cmd = " ".join(p.info['cmdline']) if p.info['cmdline'] else ""
                for s in services:
                    if s["id"] == "vector-agent":
                        continue
                    if s["command"] in cmd and "service_manager" not in cmd:
                        s["status"] = "running"
                        s["pid"] = p.info['pid']
                        s["started_at"] = p.info['create_time']
                        try:
                            s["memory_mb"] = round(p.info['memory_info'].rss / (1024 * 1024), 1)
                            s["cpu_percent"] = p.cpu_percent(interval=0.05)
                        except Exception:
                            s["memory_mb"] = 0
                            s["cpu_percent"] = 0
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass

        # API is serving requests so mark running
        for s in services:
            if s["id"] == "api-server" and s["status"] == "stopped":
                s["status"] = "running"
                s["pid"] = os.getpid()
                self_p = psutil.Process(os.getpid())
                s["started_at"] = self_p.create_time()
                try:
                    s["memory_mb"] = round(self_p.memory_info().rss / (1024 * 1024), 1)
                    s["cpu_percent"] = self_p.cpu_percent(interval=0.05)
                except Exception:
                    s["memory_mb"] = 0
                    s["cpu_percent"] = 0

        # Vector Agent process detection
        for s in services:
            if s["id"] == "vector-agent":
                vector_proc = None
                try:
                    for p in psutil.process_iter(['pid', 'name', 'create_time', 'memory_info', 'cmdline']):
                        try:
                            if (p.info['name'] or "").lower() in ("vector.exe", "vector"):
                                vector_proc = p
                                break
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass
                except Exception:
                    pass

                if vector_proc:
                    s["status"] = "running"
                    s["pid"] = vector_proc.info['pid']
                    try:
                        s["started_at"] = vector_proc.info['create_time']
                        s["memory_mb"] = round(vector_proc.info['memory_info'].rss / (1024 * 1024), 1)
                        s["cpu_percent"] = vector_proc.cpu_percent(interval=0.05)
                    except Exception:
                        pass
                    svc_info = get_windows_service_status("VectorAgent")
                    s["start_type"] = svc_info.get("start_type", "auto")
                else:
                    svc_info = get_windows_service_status("VectorAgent")
                    s["status"] = "stopped"
                    s["pid"] = None
                    s["start_type"] = svc_info.get("start_type", "auto")

    except Exception:
        pass

    return services

def get_system_health() -> dict:
    """Collect host resource utilization and active network adapters."""
    try:
        mem = psutil.virtual_memory()
        cpu = psutil.cpu_percent(interval=0.2)
        net_if_addrs = psutil.net_if_addrs()
        net_if_stats = psutil.net_if_stats()
        
        interfaces = []
        for interface_name, addrs in net_if_addrs.items():
            stats = net_if_stats.get(interface_name)
            is_up = stats.isup if stats else False
            speed = stats.speed if stats else 0
            has_ipv4 = any(addr.family == 2 for addr in addrs)
            if is_up and has_ipv4 and "loopback" not in interface_name.lower():
                interfaces.append({
                    "name": interface_name,
                    "speed": f"{speed} Mbps" if speed > 0 else "Unknown",
                    "status": "up" if is_up else "down"
                })
        
        return {
            "status": "healthy",
            "cpu_percent": cpu,
            "ram": {
                "total_gb": round(mem.total / (1024**3), 1),
                "used_gb": round(mem.used / (1024**3), 1),
                "percent": mem.percent
            },
            "interfaces": interfaces,
            "boot_time": psutil.boot_time()
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

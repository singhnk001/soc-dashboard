"""
api/index.py
============
SOC Dashboard FastAPI Core Application Entrypoint.
Modular router architecture, lifespan startup with PostgreSQL connection pooling,
and advisory-locked schema migrations.
"""

import os
import sys
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager
import psycopg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure root directory is on PYTHONPATH
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.core.config import settings
from api.core.database import get_pool, close_pool
from api.core.schema import init_db
from api.correlation import start_batch_scheduler
from api.services.syslog import SyslogProtocol
from api.services.scheduler import start_background_scheduler

# Import Routers
from api.streaming import router as streaming_router
from api.routers.auth import router as auth_router
from api.routers.logs import router as logs_router
from api.routers.alerts import router as alerts_router
from api.routers.stats import router as stats_router
from api.routers.threat_intel import router as threat_intel_router
from api.routers.playbooks import router as playbooks_router
from api.routers.reference_sets import router as reference_sets_router
from api.routers.usecases import router as usecases_router
from api.routers.parsers import router as parsers_router
from api.routers.sources import router as sources_router
from api.routers.system import router as system_router
from api.routers.mitre import router as mitre_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager."""
    # 1. Clean up any stale/idle connections from previous processes
    try:
        cleanup_conn = psycopg.connect(
            host=settings.DB_HOST, port=settings.DB_PORT,
            user=settings.DB_USER, password=settings.DB_PASSWORD,
            dbname=settings.DB_NAME
        )
        cleanup_conn.autocommit = True
        cc = cleanup_conn.cursor()
        cc.execute("""
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = %s
              AND pid != pg_backend_pid()
              AND state IN ('idle', 'idle in transaction')
              AND state_change < now() - interval '10 seconds'
        """, (settings.DB_NAME,))
        cc.execute('SELECT pg_advisory_unlock_all()')
        cleanup_conn.close()
    except Exception as e:
        print(f"[lifespan] Connection cleanup note: {e}")

    # 2. Initialize connection pool inside event loop
    try:
        get_pool()
        print("[lifespan] Connection pool opened.")
    except Exception as e:
        print(f"[lifespan] DB pool initialization failed: {e}")

    # 3. Advisory-locked schema migrations (safe for multi-worker startups)
    try:
        mig_conn = psycopg.connect(
            host=settings.DB_HOST, port=settings.DB_PORT,
            user=settings.DB_USER, password=settings.DB_PASSWORD,
            dbname=settings.DB_NAME
        )
        mig_conn.autocommit = True
        mig_cur = mig_conn.cursor()
        mig_cur.execute('SELECT pg_try_advisory_lock(8675309)')
        won = mig_cur.fetchone()[0]
        if won:
            print("[lifespan] Acquired advisory lock — verifying schema migrations...")
            init_db()
            mig_cur.execute('SELECT pg_advisory_unlock(8675309)')
            print("[lifespan] Schema migrations complete, advisory lock released.")
        else:
            print("[lifespan] Another worker holds migration lock — skipping DDL.")
        mig_conn.close()
    except Exception as e:
        print(f"[lifespan] Schema migration notice: {e}")

    # 4. Start 5-minute batch correlation scheduler
    try:
        start_batch_scheduler(app)
    except Exception as e:
        print(f"[lifespan] Batch correlation scheduler note: {e}")

    # 5. Start background threat feed & TTL scheduler
    start_background_scheduler()

    # 6. Start UDP Syslog listener on port 1514
    try:
        loop = asyncio.get_running_loop()
        transport, _ = await loop.create_datagram_endpoint(
            lambda: SyslogProtocol(),
            local_addr=('0.0.0.0', 1514)
        )
        app.state.syslog_transport = transport
    except Exception as e:
        print(f"[lifespan] Syslog server note: {e}")

    yield

    # Shutdown logic
    if hasattr(app.state, 'syslog_transport') and app.state.syslog_transport:
        app.state.syslog_transport.close()
    close_pool()
    print("[lifespan] Shutdown complete.")


# Initialize FastAPI app
app = FastAPI(
    title="SOC Dashboard API",
    description="Scalable Security Operations Center API with PostgreSQL persistence, Threat Intelligence, and SOAR Playbooks",
    version="2.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount modular routers
app.include_router(auth_router)
app.include_router(logs_router)
app.include_router(alerts_router)
app.include_router(stats_router)
app.include_router(threat_intel_router)
app.include_router(playbooks_router)
app.include_router(reference_sets_router)
app.include_router(usecases_router)
app.include_router(parsers_router)
app.include_router(sources_router)
app.include_router(system_router)
app.include_router(mitre_router)
app.include_router(streaming_router, prefix="/api")

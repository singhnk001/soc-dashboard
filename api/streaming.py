"""
api/streaming.py
================
Memory-safe streaming endpoints for large log queries.

Equivalent to the Node.js pg-query-stream pattern described in the architecture
doc, but implemented with FastAPI StreamingResponse + a server-side PostgreSQL
cursor so the V8/Python heap never holds more than one batch at a time.

Mount in index.py:
    from streaming import router as streaming_router
    app.include_router(streaming_router, prefix="/api")
"""

import json
import os
from typing import Optional

import psycopg
from psycopg.rows import dict_row
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

from api.core.config import settings

DB_DSN = settings.db_conninfo

BATCH_SIZE = 500  # rows fetched per round-trip to Postgres


def _stream_query(sql: str, params: tuple, batch_size: int = BATCH_SIZE):
    """
    Generator: opens a named server-side cursor, yields JSON lines one at a time.
    Each line is a JSON object followed by '\n' (NDJSON / JSON Lines format).
    The opening '[' and closing ']' are yielded so the client receives valid JSON.
    """
    with psycopg.connect(DB_DSN, row_factory=dict_row) as conn:
        # autocommit required for server-side cursors outside explicit transaction
        conn.autocommit = False
        with conn.cursor(name="soc_stream_cursor") as cur:
            cur.itersize = batch_size
            cur.execute(sql, params)

            yield "["
            first = True
            while True:
                rows = cur.fetchmany(batch_size)
                if not rows:
                    break
                for row in rows:
                    prefix = "" if first else ","
                    first = False
                    yield prefix + json.dumps(row, default=str)
            yield "]"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/logs/stream")
def stream_logs(
    severity: Optional[str]  = Query(None, description="Filter by severity"),
    source:   Optional[str]  = Query(None, description="Filter by source"),
    hostname: Optional[str]  = Query(None, description="Filter by hostname"),
    from_ts:  Optional[str]  = Query(None, description="ISO timestamp start (e.g. 2026-01-01T00:00:00Z)"),
    to_ts:    Optional[str]  = Query(None, description="ISO timestamp end"),
    limit:    int            = Query(50000, le=500000, description="Max rows to stream (hard cap 500k)"),
):
    """
    Stream logs as a JSON array without loading the full result into memory.

    Uses a PostgreSQL server-side named cursor and yields rows in batches of
    500. The response Content-Type is application/json; the body is a valid
    JSON array regardless of row count.

    Example:
        GET /api/logs/stream?severity=critical&limit=10000
        GET /api/logs/stream?from_ts=2026-09-01T00:00:00Z&to_ts=2026-09-30T23:59:59Z
    """
    conditions = []
    params: list = []

    if severity:
        conditions.append("severity = %s")
        params.append(severity)
    if source:
        conditions.append("source ILIKE %s")
        params.append(f"%{source}%")
    if hostname:
        conditions.append("hostname ILIKE %s")
        params.append(f"%{hostname}%")
    if from_ts:
        conditions.append("timestamp >= %s")
        params.append(from_ts)
    if to_ts:
        conditions.append("timestamp <= %s")
        params.append(to_ts)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"""
        SELECT id, timestamp, source, event_id, severity, message,
               hostname, username, extracted_fields,
               source_ip, destination_ip, mitre_tactics, mitre_techniques,
               created_at
        FROM   logs
        {where}
        ORDER  BY timestamp DESC
        LIMIT  %s
    """
    params.append(limit)

    return StreamingResponse(
        _stream_query(sql, tuple(params)),
        media_type="application/json",
        headers={
            "X-Stream-Format": "json-array",
            "Cache-Control":   "no-store",
        },
    )


@router.get("/logs/stream/csv")
def stream_logs_csv(
    severity: Optional[str] = Query(None),
    from_ts:  Optional[str] = Query(None),
    to_ts:    Optional[str] = Query(None),
    limit:    int           = Query(100000, le=1000000),
):
    """
    Stream logs as CSV for large exports (forensic / compliance use).
    Each row is a CSV line; the first line is a header.
    """
    COLS = [
        "id", "timestamp", "source", "event_id", "severity",
        "message", "hostname", "username", "source_ip",
        "destination_ip", "mitre_tactics", "mitre_techniques", "created_at",
    ]

    conditions = []
    params: list = []
    if severity:
        conditions.append("severity = %s")
        params.append(severity)
    if from_ts:
        conditions.append("timestamp >= %s")
        params.append(from_ts)
    if to_ts:
        conditions.append("timestamp <= %s")
        params.append(to_ts)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"""
        SELECT {', '.join(COLS)}
        FROM   logs
        {where}
        ORDER  BY timestamp DESC
        LIMIT  %s
    """
    params.append(limit)

    def _csv_generator():
        import csv
        import io
        yield ",".join(COLS) + "\n"
        with psycopg.connect(DB_DSN, row_factory=dict_row) as conn:
            conn.autocommit = False
            with conn.cursor(name="soc_csv_cursor") as cur:
                cur.itersize = BATCH_SIZE
                cur.execute(sql, tuple(params))
                while True:
                    rows = cur.fetchmany(BATCH_SIZE)
                    if not rows:
                        break
                    buf = io.StringIO()
                    writer = csv.DictWriter(buf, fieldnames=COLS, extrasaction="ignore")
                    for row in rows:
                        writer.writerow(row)
                    yield buf.getvalue()

    return StreamingResponse(
        _csv_generator(),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="soc_logs_export.csv"',
            "Cache-Control":       "no-store",
        },
    )


@router.get("/logs/stream/stats")
def stream_stats(
    from_ts: Optional[str] = Query(None),
    to_ts:   Optional[str] = Query(None),
):
    """
    Aggregate EPS stats from the logs_per_minute materialized view (pure PostgreSQL).
    Falls back to a direct aggregate on the logs table if the view hasn't been
    created yet (i.e., postgres_setup.sql hasn't been run).
    """
    conditions = []
    params: list = []
    if from_ts:
        conditions.append("bucket >= %s")
        params.append(from_ts)
    if to_ts:
        conditions.append("bucket <= %s")
        params.append(to_ts)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    # Primary: use the materialized view (fast, pre-aggregated)
    matview_sql = f"""
        SELECT bucket, severity, source, event_count
        FROM   logs_per_minute
        {where}
        ORDER  BY bucket DESC
        LIMIT  1440
    """

    # Fallback: live aggregate directly from logs table
    fallback_where = where.replace("bucket", "timestamp::timestamptz")
    fallback_sql = f"""
        SELECT
            date_trunc('minute', timestamp::timestamptz) AS bucket,
            severity,
            source,
            COUNT(*) AS event_count
        FROM logs
        {fallback_where}
        GROUP BY 1, 2, 3
        ORDER BY 1 DESC
        LIMIT 1440
    """

    def _stats_gen():
        try:
            yield from _stream_query(matview_sql, tuple(params))
        except Exception:
            # Materialized view not yet created — fall back to live query
            yield from _stream_query(fallback_sql, tuple(params))

    return StreamingResponse(_stats_gen(), media_type="application/json")

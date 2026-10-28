"""
api/correlation.py
==================
Hybrid Detection Engine — Python equivalent of the Sigma + JSON Rules Engine
described in the SIEM architecture doc.

TWO pipelines:
  1. STREAM  — evaluates every inbound log in RAM against match/regex rules.
               Fires instant single-event alerts (bad IPs, known patterns).
  2. BATCH   — runs on a 5-minute APScheduler cron, queries PostgreSQL for
               aggregation-based rules (brute force thresholds, time windows).

Attach to index.py:
    from correlation import engine, start_batch_scheduler
    # call start_batch_scheduler(app) inside the FastAPI lifespan handler
"""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any

import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger("soc.correlation")

# ── DB helpers ────────────────────────────────────────────────────────────────

DB_DSN = (
    f"host={os.environ.get('DB_HOST','localhost')} "
    f"port={os.environ.get('DB_PORT','5432')} "
    f"user={os.environ.get('DB_USER','postgres')} "
    f"password={os.environ.get('DB_PASSWORD','')} "
    f"dbname={os.environ.get('DB_NAME','SOC_DB')}"
)


def _get_conn():
    return psycopg.connect(DB_DSN, row_factory=dict_row)


def _load_use_cases() -> list[dict]:
    """Fetch active use cases from DB at engine startup and refresh."""
    try:
        with _get_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM use_cases WHERE active = TRUE"
            ).fetchall()
            return [dict(r) for r in rows]
    except Exception as e:
        log.warning("Could not load use cases from DB: %s", e)
        return []


def _insert_alert(alert: dict):
    """Persist a generated alert to the alerts table."""
    sql = """
        INSERT INTO alerts
            (id, timestamp, title, description, severity, status,
             source, event_id, mitre_ref, raw_log, extracted_fields)
        VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING
    """
    try:
        with _get_conn() as conn:
            conn.execute(sql, (
                alert["id"],
                alert["timestamp"],
                alert["title"],
                alert["description"],
                alert["severity"],
                "new",
                alert.get("source", ""),
                alert.get("event_id", ""),
                alert.get("mitre_ref", ""),
                alert.get("raw_log", ""),
                alert.get("extracted_fields", "{}"),
            ))
            conn.commit()
            log.info("Alert created: [%s] %s", alert["severity"].upper(), alert["title"])
    except Exception as e:
        log.error("Failed to insert alert: %s", e)


# ── Rule evaluator ────────────────────────────────────────────────────────────

class _RuleEvaluator:
    """Evaluates a single log event against a rule_logic JSON predicate."""

    _OP_MAP = {
        "contains":     lambda v, t: t.lower() in str(v).lower(),
        "not_contains": lambda v, t: t.lower() not in str(v).lower(),
        "equals":       lambda v, t: str(v).lower() == str(t).lower(),
        "not_equals":   lambda v, t: str(v).lower() != str(t).lower(),
        "regex":        lambda v, t: bool(re.search(t, str(v), re.IGNORECASE)),
        "startswith":   lambda v, t: str(v).lower().startswith(t.lower()),
        "endswith":     lambda v, t: str(v).lower().endswith(t.lower()),
        ">":            lambda v, t: float(v) > float(t),
        "<":            lambda v, t: float(v) < float(t),
        ">=":           lambda v, t: float(v) >= float(t),
        "<=":           lambda v, t: float(v) <= float(t),
    }

    def evaluate(self, rule_logic: str | None, log_event: dict) -> bool:
        if not rule_logic:
            return True  # no filter = always matches event_id check
        try:
            predicate = json.loads(rule_logic)
        except (json.JSONDecodeError, TypeError):
            return False

        return self._eval_predicate(predicate, log_event)

    def _eval_predicate(self, pred: Any, event: dict) -> bool:
        if not isinstance(pred, dict):
            return False

        # AND / OR compound
        if "AND" in pred:
            return all(self._eval_predicate(p, event) for p in pred["AND"])
        if "OR" in pred:
            return any(self._eval_predicate(p, event) for p in pred["OR"])
        if "NOT" in pred:
            return not self._eval_predicate(pred["NOT"], event)

        # Leaf condition: {"field": "...", "operator": "...", "value": "..."}
        field    = pred.get("field", "")
        operator = pred.get("operator", "contains")
        target   = pred.get("value", "")

        # Look in top-level event keys AND extracted_fields
        value = event.get(field)
        if value is None:
            extracted = event.get("extracted_fields", "{}")
            if isinstance(extracted, str):
                try:
                    extracted = json.loads(extracted)
                except Exception:
                    extracted = {}
            value = extracted.get(field, "")

        op_fn = self._OP_MAP.get(operator)
        if op_fn is None:
            return False

        try:
            return op_fn(value, target)
        except (ValueError, TypeError):
            return False


_evaluator = _RuleEvaluator()


# ── Stream pipeline (called per-log in ingest endpoint) ───────────────────────

class CorrelationEngine:
    """
    Main engine. Instantiate once at module level and call .process_stream()
    from inside the /api/logs/ingest endpoint handler.
    """

    def __init__(self):
        self._rules: list[dict] = []
        self._refresh_rules()

    def _refresh_rules(self):
        """Reload active use cases from the database."""
        self._rules = _load_use_cases()
        log.info("Correlation engine loaded %d rules.", len(self._rules))

    def refresh(self):
        """Public method: call after a use case is created/updated/deleted."""
        self._refresh_rules()

    # ── Stream evaluation (single event, in RAM) ──────────────────────────────

    def process_stream(self, log_event: dict):
        """
        Called inline from the ingest endpoint for every arriving log.
        Evaluates 'match' type rules only (instant, single-event).
        """
        for rule in self._rules:
            if rule.get("type") != "match":
                continue

            # Event ID filter (optional)
            rule_event_id = rule.get("event_id")
            if rule_event_id and str(log_event.get("event_id", "")) != str(rule_event_id):
                continue

            # Source filter (optional)
            rule_source = rule.get("source")
            if rule_source and rule_source.lower() not in str(log_event.get("source", "")).lower():
                continue

            # Evaluate rule_logic predicate
            if _evaluator.evaluate(rule.get("rule_logic"), log_event):
                self._fire_stream_alert(rule, log_event)

    def _fire_stream_alert(self, rule: dict, event: dict):
        alert = {
            "id":               str(uuid.uuid4()),
            "timestamp":        datetime.now(timezone.utc).isoformat(),
            "title":            rule["title"],
            "description":      f"[Stream] {rule.get('description', '')} | "
                                f"Triggered by log from {event.get('hostname','?')} "
                                f"(Event {event.get('event_id','?')})",
            "severity":         rule.get("severity", "medium"),
            "source":           event.get("source", ""),
            "event_id":         event.get("event_id", ""),
            "mitre_ref":        rule.get("mitre_technique", ""),
            "raw_log":          event.get("raw_log", ""),
            "extracted_fields": event.get("extracted_fields", "{}"),
        }
        _insert_alert(alert)

    # ── Batch pipeline (runs every 5 minutes via APScheduler) ─────────────────

    def run_batch(self):
        """
        Evaluate threshold-type rules by querying PostgreSQL for aggregations
        over the past 5-minute window. Also refreshes the logs_per_minute
        materialized view so the stats endpoint stays current.
        Called by the APScheduler every 5 minutes.
        """
        log.debug("Correlation batch run started.")

        # Refresh materialized view (pure PostgreSQL, no TimescaleDB needed)
        try:
            with _get_conn() as conn:
                conn.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY logs_per_minute")
                conn.commit()
                log.debug("logs_per_minute view refreshed.")
        except Exception as e:
            log.debug("Could not refresh logs_per_minute (not yet created?): %s", e)

        for rule in self._rules:
            if rule.get("type") != "threshold":
                continue
            threshold = rule.get("threshold_count", 1)
            if not threshold:
                continue
            self._evaluate_threshold_rule(rule, threshold)
        log.debug("Correlation batch run complete.")

    def _evaluate_threshold_rule(self, rule: dict, threshold: int):
        """
        Counts matching logs in the last 5 minutes.  If count >= threshold,
        fires a batch alert (deduplicated — one alert per 5-min window per rule).
        """
        conditions = ["timestamp >= NOW() - INTERVAL '5 minutes'"]
        params: list = []

        rule_event_id = rule.get("event_id")
        if rule_event_id:
            conditions.append("event_id = %s")
            params.append(str(rule_event_id))

        where = " AND ".join(conditions)
        sql = f"""
            SELECT COUNT(*) AS cnt, hostname, username
            FROM   logs
            WHERE  {where}
            GROUP  BY hostname, username
            HAVING COUNT(*) >= %s
            LIMIT  10
        """
        params.append(threshold)

        try:
            with _get_conn() as conn:
                rows = conn.execute(sql, params).fetchall()

            for row in rows:
                count    = row["cnt"]
                hostname = row["hostname"] or "unknown"
                username = row["username"] or "unknown"

                alert = {
                    "id":               str(uuid.uuid4()),
                    "timestamp":        datetime.now(timezone.utc).isoformat(),
                    "title":            rule["title"],
                    "description":      (
                        f"[Batch] {rule.get('description','')} | "
                        f"{count} events in 5 min on {hostname} "
                        f"(user: {username}) — threshold: {threshold}"
                    ),
                    "severity":         rule.get("severity", "medium"),
                    "source":           rule.get("event_id", ""),
                    "event_id":         rule.get("event_id", ""),
                    "mitre_ref":        rule.get("mitre_technique", ""),
                    "raw_log":          "",
                    "extracted_fields": json.dumps({
                        "count": count,
                        "hostname": hostname,
                        "username": username,
                        "rule_id": rule.get("id"),
                    }),
                }
                _insert_alert(alert)

        except Exception as e:
            log.error("Batch rule '%s' failed: %s", rule.get("title"), e)


# ── Module-level singleton ─────────────────────────────────────────────────────
engine = CorrelationEngine()


# ── Scheduler bootstrap (call once from FastAPI lifespan) ─────────────────────

def start_batch_scheduler(app):
    """
    Wire APScheduler into FastAPI's lifespan.  Add this to index.py:

        from contextlib import asynccontextmanager
        from correlation import engine, start_batch_scheduler

        @asynccontextmanager
        async def lifespan(app: FastAPI):
            start_batch_scheduler(app)
            yield

        app = FastAPI(lifespan=lifespan)
    """
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
    except ImportError:
        log.warning(
            "APScheduler not installed — batch correlation disabled. "
            "Run: pip install apscheduler"
        )
        return

    scheduler = BackgroundScheduler(daemon=True)
    scheduler.add_job(
        engine.run_batch,
        trigger="interval",
        minutes=5,
        id="soc_batch_correlation",
        replace_existing=True,
    )
    scheduler.start()
    log.info("Batch correlation scheduler started (5-min interval).")

    # Attach to app state so it can be shut down cleanly
    app.state.scheduler = scheduler

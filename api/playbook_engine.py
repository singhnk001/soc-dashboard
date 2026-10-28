"""
SOAR Playbook Engine
Executes automated response actions when alerts are triggered.
Actions: Slack webhook, MS Teams webhook, AD user disable, Windows firewall block, pfSense block.
"""

import json
import subprocess
import uuid
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("playbook_engine")


# ── Action Executors ──────────────────────────────────────────────────────────

def _run_slack(action: dict, context: dict) -> dict:
    """POST a Slack Incoming Webhook message."""
    import urllib.request
    webhook_url = action.get("webhook_url", "")
    if not webhook_url:
        return {"status": "skipped", "reason": "no webhook_url configured"}

    severity = context.get("severity", "unknown").upper()
    title    = context.get("alert_title", "SOC Alert")
    hostname = context.get("hostname", "unknown")
    source   = context.get("source", "unknown")
    sev_emoji = {"CRITICAL": "🔴", "HIGH": "🟠", "MEDIUM": "🟡", "LOW": "🟢"}.get(severity, "⚪")

    payload = {
        "text": f"{sev_emoji} *[{severity}] {title}*",
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": (
                        f"{sev_emoji} *[{severity}] {title}*\n"
                        f"*Host:* `{hostname}`  |  *Source:* `{source}`\n"
                        f"*Time:* {context.get('timestamp', 'unknown')}"
                    )
                }
            },
            {"type": "divider"},
            {
                "type": "context",
                "elements": [{"type": "mrkdwn", "text": "SOC Dashboard · Automated SOAR Alert"}]
            }
        ]
    }

    data = json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(webhook_url, data=data, headers={"Content-Type": "application/json"})
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return {"status": "success", "http_status": resp.status}
    except Exception as e:
        return {"status": "failed", "error": str(e)}


def _run_teams(action: dict, context: dict) -> dict:
    """POST a Microsoft Teams Incoming Webhook (Adaptive Card)."""
    import urllib.request
    webhook_url = action.get("webhook_url", "")
    if not webhook_url:
        return {"status": "skipped", "reason": "no webhook_url configured"}

    severity = context.get("severity", "unknown").upper()
    title    = context.get("alert_title", "SOC Alert")
    hostname = context.get("hostname", "unknown")
    color_map = {"CRITICAL": "attention", "HIGH": "warning", "MEDIUM": "default", "LOW": "good"}

    payload = {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "type": "AdaptiveCard",
                "version": "1.4",
                "body": [
                    {
                        "type": "TextBlock",
                        "text": f"[{severity}] {title}",
                        "weight": "Bolder",
                        "size": "Medium",
                        "color": color_map.get(severity, "default")
                    },
                    {
                        "type": "FactSet",
                        "facts": [
                            {"title": "Host", "value": hostname},
                            {"title": "Source", "value": context.get("source", "unknown")},
                            {"title": "Time", "value": context.get("timestamp", "unknown")},
                            {"title": "Severity", "value": severity},
                        ]
                    }
                ]
            }
        }]
    }

    data = json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(webhook_url, data=data, headers={"Content-Type": "application/json"})
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return {"status": "success", "http_status": resp.status}
    except Exception as e:
        return {"status": "failed", "error": str(e)}


def _run_generic_webhook(action: dict, context: dict) -> dict:
    """POST a generic JSON webhook to any HTTP endpoint."""
    import urllib.request
    url = action.get("webhook_url", "")
    if not url:
        return {"status": "skipped", "reason": "no webhook_url configured"}

    payload = {
        "event": "soc_alert",
        "alert_title": context.get("alert_title"),
        "severity": context.get("severity"),
        "hostname": context.get("hostname"),
        "source": context.get("source"),
        "timestamp": context.get("timestamp"),
        "alert_id": context.get("alert_id"),
    }
    data = json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return {"status": "success", "http_status": resp.status}
    except Exception as e:
        return {"status": "failed", "error": str(e)}


def _run_disable_ad_user(action: dict, context: dict) -> dict:
    """
    Disable an Active Directory user via PowerShell Disable-ADAccount.
    Requires the RSAT AD module on the machine running this API.
    Username is taken from the alert context (extracted username field).
    """
    username = context.get("username") or action.get("username", "")
    if not username or username in ("N/A", "-", "SYSTEM", "LOCAL SERVICE", "NETWORK SERVICE"):
        return {"status": "skipped", "reason": f"no actionable username in context (got: {username!r})"}

    domain = action.get("domain", "")
    target = f"{domain}\\{username}" if domain else username

    ps_cmd = (
        f"Import-Module ActiveDirectory -ErrorAction Stop; "
        f"Disable-ADAccount -Identity '{target}' -Confirm:$false; "
        f"Write-Output 'Disabled: {target}'"
    )
    try:
        result = subprocess.run(
            ["powershell", "-NonInteractive", "-NoProfile", "-Command", ps_cmd],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            return {"status": "success", "output": result.stdout.strip(), "target": target}
        else:
            return {"status": "failed", "error": result.stderr.strip() or result.stdout.strip(), "target": target}
    except subprocess.TimeoutExpired:
        return {"status": "failed", "error": "PowerShell timeout after 30s"}
    except Exception as e:
        return {"status": "failed", "error": str(e)}


def _run_block_ip_windows_firewall(action: dict, context: dict) -> dict:
    """
    Block a source IP on the Windows Firewall using netsh / New-NetFirewallRule.
    IP is taken from the alert context (src_ip field).
    """
    import re
    ip = context.get("src_ip") or action.get("ip", "")
    if not ip:
        return {"status": "skipped", "reason": "no src_ip in alert context"}

    # Validate IP format
    if not re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', ip):
        return {"status": "skipped", "reason": f"invalid IP format: {ip!r}"}

    # Skip private/loopback IPs
    private = re.compile(r'^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.0\.0\.0)')
    if private.match(ip):
        return {"status": "skipped", "reason": f"will not block private IP {ip}"}

    rule_name = f"SOC-Block-{ip}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    ps_cmd = (
        f"New-NetFirewallRule -DisplayName '{rule_name}' "
        f"-Direction Inbound -Action Block -RemoteAddress {ip} -Protocol Any -Profile Any -ErrorAction Stop; "
        f"Write-Output 'Blocked: {ip}'"
    )
    try:
        result = subprocess.run(
            ["powershell", "-NonInteractive", "-NoProfile", "-Command", ps_cmd],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            return {"status": "success", "output": result.stdout.strip(), "ip": ip, "rule": rule_name}
        else:
            return {"status": "failed", "error": result.stderr.strip() or result.stdout.strip(), "ip": ip}
    except subprocess.TimeoutExpired:
        return {"status": "failed", "error": "PowerShell timeout after 30s"}
    except Exception as e:
        return {"status": "failed", "error": str(e)}


def _run_block_ip_pfsense(action: dict, context: dict) -> dict:
    """
    Block an IP on pfSense via its REST API (pfBlockerNG or native API).
    Requires: pfsense_url, api_key, alias_name in action config.
    """
    import urllib.request
    ip = context.get("src_ip") or action.get("ip", "")
    pfsense_url = action.get("pfsense_url", "").rstrip("/")
    api_key     = action.get("api_key", "")
    alias_name  = action.get("alias_name", "SOC_Blocked_IPs")

    if not ip:
        return {"status": "skipped", "reason": "no src_ip in alert context"}
    if not pfsense_url:
        return {"status": "skipped", "reason": "pfsense_url not configured"}

    payload = json.dumps({
        "client-id": api_key,
        "client-token": action.get("api_token", ""),
        "type": "host",
        "name": alias_name,
        "address": [ip],
        "detail": [f"SOC auto-block {datetime.now(timezone.utc).isoformat()}"],
    }).encode("utf-8")

    url = f"{pfsense_url}/api/v1/firewall/alias/entry"
    req = urllib.request.Request(url, data=payload, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }, method="POST")
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return {"status": "success", "http_status": resp.status, "ip": ip, "alias": alias_name}
    except Exception as e:
        return {"status": "failed", "error": str(e), "ip": ip}


def _run_email(action: dict, context: dict) -> dict:
    """Send an alert email via SMTP."""
    import smtplib
    from email.mime.text import MIMEText

    smtp_host = action.get("smtp_host", "")
    smtp_port = int(action.get("smtp_port", 587))
    smtp_user = action.get("smtp_user", "")
    smtp_pass = action.get("smtp_pass", "")
    to_addr   = action.get("to", "")

    if not smtp_host or not to_addr:
        return {"status": "skipped", "reason": "smtp_host or to address not configured"}

    severity = context.get("severity", "unknown").upper()
    title    = context.get("alert_title", "SOC Alert")
    body = (
        f"Severity: {severity}\n"
        f"Alert: {title}\n"
        f"Host: {context.get('hostname', 'unknown')}\n"
        f"Source: {context.get('source', 'unknown')}\n"
        f"Time: {context.get('timestamp', 'unknown')}\n\n"
        f"-- SOC Dashboard Automated SOAR --"
    )
    msg = MIMEText(body)
    msg["Subject"] = f"[SOC {severity}] {title}"
    msg["From"]    = smtp_user or "soc@localhost"
    msg["To"]      = to_addr

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as s:
            s.starttls()
            if smtp_user:
                s.login(smtp_user, smtp_pass)
            s.send_message(msg)
        return {"status": "success", "to": to_addr}
    except Exception as e:
        return {"status": "failed", "error": str(e)}


# ── Action Dispatcher ─────────────────────────────────────────────────────────

ACTION_MAP = {
    "slack":                   _run_slack,
    "teams":                   _run_teams,
    "webhook":                 _run_generic_webhook,
    "disable_ad_user":         _run_disable_ad_user,
    "block_ip_windows":        _run_block_ip_windows_firewall,
    "block_ip_pfsense":        _run_block_ip_pfsense,
    "email":                   _run_email,
}


def execute_playbook(playbook: dict, alert: dict, conn) -> str:
    """
    Run all actions in a playbook against the alert context.
    Returns the execution_id so callers can link back to it.
    Inserts a playbook_executions row and updates it when done.
    """
    exec_id = str(uuid.uuid4())
    context = {
        "alert_id":    alert.get("id", ""),
        "alert_title": alert.get("title", ""),
        "severity":    alert.get("severity", ""),
        "source":      alert.get("source", ""),
        "hostname":    alert.get("hostname") or _extract_hostname(alert),
        "username":    alert.get("username") or _extract_username(alert),
        "src_ip":      alert.get("src_ip") or _extract_src_ip(alert),
        "timestamp":   alert.get("timestamp", ""),
    }

    actions  = playbook.get("actions", [])
    if isinstance(actions, str):
        try:
            actions = json.loads(actions)
        except Exception:
            actions = []

    results  = []
    overall  = "success"

    cursor = conn.cursor()

    # Insert running record
    cursor.execute(
        """INSERT INTO playbook_executions (id, playbook_id, alert_id, status, results)
           VALUES (%s, %s, %s, 'running', %s)""",
        (exec_id, playbook["id"], alert.get("id"), "[]")
    )
    conn.commit()

    for action in actions:
        atype = action.get("type", "")
        handler = ACTION_MAP.get(atype)
        if not handler:
            results.append({"action": atype, "status": "unknown_type"})
            continue
        try:
            result = handler(action, context)
        except Exception as e:
            result = {"status": "failed", "error": str(e)}
        result["action"] = atype
        result["action_name"] = action.get("name", atype)
        results.append(result)
        if result.get("status") == "failed":
            overall = "partial" if overall == "success" else "failed"

    # Update execution record
    cursor.execute(
        """UPDATE playbook_executions SET status = %s, results = %s WHERE id = %s""",
        (overall, json.dumps(results), exec_id)
    )
    conn.commit()

    return exec_id


# ── Context Extractors ────────────────────────────────────────────────────────

def _extract_hostname(alert: dict) -> str:
    raw = alert.get("raw_log") or ""
    if raw.startswith("{"):
        try:
            d = json.loads(raw)
            return d.get("hostname") or d.get("extracted_fields", {}).get("hostname") or ""
        except Exception:
            pass
    return ""


def _extract_username(alert: dict) -> str:
    raw = alert.get("raw_log") or ""
    if raw.startswith("{"):
        try:
            d = json.loads(raw)
            ef = d.get("extracted_fields", {})
            return ef.get("username") or ef.get("SubjectUserName") or ef.get("TargetUserName") or ""
        except Exception:
            pass
    return ""


def _extract_src_ip(alert: dict) -> str:
    import re
    raw = alert.get("raw_log") or alert.get("description") or ""
    if raw.startswith("{"):
        try:
            d = json.loads(raw)
            ef = d.get("extracted_fields", {})
            ip = ef.get("src_ip") or ef.get("IpAddress") or ef.get("SourceAddress") or ""
            if ip:
                return ip
        except Exception:
            pass
    # fallback regex
    ips = re.findall(r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b', raw)
    private = re.compile(r'^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.)')
    public  = [ip for ip in ips if not private.match(ip) and ip not in ('0.0.0.0', '255.255.255.255')]
    return public[0] if public else ""


# ── Trigger Evaluator ─────────────────────────────────────────────────────────

def should_trigger(playbook: dict, alert: dict) -> bool:
    """Return True if this alert should fire this playbook."""
    if not playbook.get("enabled", True):
        return False

    # Severity match
    trigger_sev = (playbook.get("trigger_severity") or "critical").lower()
    alert_sev   = (alert.get("severity") or "").lower()

    sev_order = {"low": 1, "medium": 2, "high": 3, "critical": 4}
    if sev_order.get(alert_sev, 0) < sev_order.get(trigger_sev, 4):
        return False

    # Optional keyword match
    keyword = (playbook.get("trigger_keyword") or "").strip().lower()
    if keyword:
        searchable = " ".join(filter(None, [
            alert.get("title", ""),
            alert.get("description", ""),
            alert.get("source", ""),
        ])).lower()
        if keyword not in searchable:
            return False

    return True

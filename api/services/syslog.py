"""
api/services/syslog.py
======================
Asyncio UDP listener for standard RFC3164 Syslog (e.g., Linux, routers, appliances).
"""

import asyncio
import re
from datetime import datetime
from api.core.database import get_db
from api.models.log import LogEntry
from api.services.ingestion import process_log_entry

class SyslogProtocol(asyncio.DatagramProtocol):
    """UDP listener decoding RFC3164 syslog datagrams and piping to ingestion pipeline."""
    def connection_made(self, transport):
        self.transport = transport

    def datagram_received(self, data, addr):
        message = data.decode('utf-8', errors='replace').strip()
        try:
            severity = "medium"
            hostname = addr[0]
            app_name = "syslog"

            pri_match = re.match(r'^<(\d+)>(.*)', message)
            if pri_match:
                pri = int(pri_match.group(1))
                sev = pri & 7
                message_body = pri_match.group(2)
                if sev <= 2:
                    severity = "critical"
                elif sev <= 3:
                    severity = "high"
                elif sev <= 4:
                    severity = "medium"
                elif sev <= 6:
                    severity = "low"
                else:
                    severity = "info"
            else:
                message_body = message

            body_match = re.match(r'^([A-Z][a-z]{2}\s+\d+\s\d+:\d+:\d+)\s+(\S+)\s+([^:]+):\s+(.*)', message_body)
            if body_match:
                hostname = body_match.group(2)
                app_name = body_match.group(3).split('[')[0]
                content = body_match.group(4)
            else:
                content = message_body

            entry = LogEntry(
                timestamp=datetime.now().isoformat(),
                source=f"Linux-{app_name}",
                severity=severity,
                message=content,
                hostname=hostname,
                username=None,
                raw_log=message
            )

            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT name, regex FROM parsers WHERE active = true")
                active_parsers = cursor.fetchall()
                cursor.execute(
                    "SELECT id, title, type, event_id, severity, mitre_technique, threshold_count FROM use_cases WHERE active = true"
                )
                active_usecases = cursor.fetchall()
                process_log_entry(entry, conn, active_parsers, active_usecases)
                conn.commit()
        except Exception:
            pass

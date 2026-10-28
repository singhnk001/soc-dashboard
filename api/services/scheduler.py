"""
api/services/scheduler.py
=========================
Background worker for scheduled Threat Intelligence sync and Reference Set TTL cleanup.
"""

import time
import threading
from datetime import datetime
from api.core.database import get_db

def run_threat_feed_scheduler():
    """Background polling thread for scheduled feed synchronizations."""
    while True:
        try:
            now = datetime.now()
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id, schedule, last_updated, url FROM threat_feeds")
                feeds = cursor.fetchall()
                
                for r in feeds:
                    feed_id = r["id"]
                    schedule = r["schedule"]
                    last_updated = r["last_updated"]
                    if not schedule or " at " not in schedule:
                        continue
                    
                    freq, time_str = schedule.split(" at ")
                    try:
                        sched_time = datetime.strptime(time_str.strip(), "%I:%M %p")
                    except Exception:
                        continue
                        
                    should_run = False
                    if freq == "Hourly":
                        if now.minute == sched_time.minute:
                            should_run = True
                    elif freq == "Daily":
                        if now.hour == sched_time.hour and now.minute == sched_time.minute:
                            should_run = True
                    elif freq == "Weekly":
                        if now.weekday() == 0 and now.hour == sched_time.hour and now.minute == sched_time.minute:
                            should_run = True
                            
                    if should_run and last_updated:
                        try:
                            lu_clean = str(last_updated).replace("Z", "").split("+")[0].split(".")[0]
                            last_dt = datetime.fromisoformat(lu_clean)
                            if (now - last_dt).total_seconds() < 120:
                                should_run = False
                        except Exception:
                            pass

            # Apply Reference Set TTL policies
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id, ttl_days FROM reference_sets WHERE ttl_days > 0")
                for r in cursor.fetchall():
                    try:
                        ttl_int = int(r["ttl_days"])
                        cursor.execute(
                            "DELETE FROM reference_set_items WHERE set_id = %s AND added_at <= CURRENT_TIMESTAMP - (INTERVAL '1 day' * %s)",
                            (r["id"], ttl_int)
                        )
                    except Exception:
                        continue
                conn.commit()
        except Exception:
            pass
            
        time.sleep(30)

def start_background_scheduler():
    """Starts the threat feed scheduler in a daemon thread."""
    thread = threading.Thread(target=run_threat_feed_scheduler, daemon=True)
    thread.start()
    return thread

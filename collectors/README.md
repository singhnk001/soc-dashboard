# SOC Dashboard Log Collectors

This directory contains standalone Python scripts designed to collect security events from endpoints and ship them to the SOC Dashboard API.

## Requirements

- Python 3.11+
- Install dependencies:
  ```bash
  pip install -r requirements.txt
  ```

## Windows Collector

The Windows collector utilizes `wevtutil` (built-in Windows utility) to query event logs. It does not require `pywin32`.

### Usage:

```bash
python windows_collector.py --api-url http://localhost:8000/api/logs/ingest --interval 60 --log-sources Security System
```

## Linux Collector

The Linux collector parses standard syslog files, tracking security events such as SSH logins, `sudo` usage, and cron job modifications.

### Usage:

```bash
sudo python linux_collector.py --api-url http://localhost:8000/api/logs/ingest --log-files /var/log/syslog /var/log/auth.log
```
Note: You may need root privileges to read files like `/var/log/auth.log`.

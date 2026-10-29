# Log Collectors Guide

## Overview
The log collectors are Python scripts that read OS logs and forward them to the FastAPI backend.

## Windows Collector
### Prerequisites
- Python 3.11+
- Administrator access (required to read Security logs)

### Installation
```bash
pip install requests pywin32
```

### Configuration Options
Run `python win_collector.py --help` for arguments.
- `--api-url`: Backend URL
- `--interval`: Polling interval in seconds

### Supported Event Logs
- Security, System, Application

## Linux Collector
### Prerequisites
- Python 3.11+
- Read access to `/var/log`

### Installation
```bash
pip install requests
```

### Configuration Options
Run `python linux_collector.py --help`.

### Supported Log Sources
- `/var/log/auth.log`, `/var/log/syslog`

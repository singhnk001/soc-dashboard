#!/bin/bash

# SOC Endpoint Agent Deployment Script for Linux
# --------------------------------------------

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

if [ -z "$1" ]; then
  echo "Usage: sudo ./deploy_agent.sh <SOC_SERVER_IP>"
  echo "Example: sudo ./deploy_agent.sh 192.168.1.6"
  exit 1
fi

SOC_IP="$1"
echo "Deploying Vector Agent to stream logs to $SOC_IP..."

echo "1. Creating directories..."
mkdir -p /opt/vector
mkdir -p /etc/vector
mkdir -p /var/lib/vector
echo "2. Downloading Vector v0.58.0..."
wget -qO vector.tar.gz "https://github.com/vectordotdev/vector/releases/download/v0.58.0/vector-0.58.0-x86_64-unknown-linux-gnu.tar.gz" || curl -fL -o vector.tar.gz "https://github.com/vectordotdev/vector/releases/download/v0.58.0/vector-0.58.0-x86_64-unknown-linux-gnu.tar.gz"

if [ ! -f "vector.tar.gz" ] || [ $(stat -c%s "vector.tar.gz") -lt 1000000 ]; then
    echo "Download failed! Please check your internet connection or firewall."
    exit 1
fi
tar -xzf vector.tar.gz
cp -r vector-x86_64-unknown-linux-gnu/bin/* /usr/local/bin/
rm -rf vector-x86_64-unknown-linux-gnu vector.tar.gz

echo "3. Generating configuration file..."
cat > /etc/vector/vector.toml << EOF
[sources.linux_journal]
type = "journald"
data_dir = "/var/lib/vector"

[sources.linux_files]
type = "file"
include = [
  "/var/log/auth.log",
  "/var/log/secure",
  "/var/log/syslog",
  "/var/log/messages"
]
data_dir = "/var/lib/vector"
read_from = "beginning"

[transforms.format_journal]
type = "remap"
inputs = ["linux_journal"]
source = '''
  severity = "info"
  if .PRIORITY == "0" || .PRIORITY == "1" || .PRIORITY == "2" { severity = "critical" }
  else if .PRIORITY == "3" { severity = "high" }
  else if .PRIORITY == "4" { severity = "medium" }
  
  . = {
    "timestamp": to_string!(.timestamp),
    "source": "Linux-Journal",
    "event_id": to_string!(.SYSLOG_IDENTIFIER || "Unknown"),
    "severity": severity,
    "message": to_string!(.message),
    "hostname": to_string!(.host),
    "username": to_string!(._UID || "N/A"),
    "raw_log": encode_json(.)
  }
'''

[transforms.format_files]
type = "remap"
inputs = ["linux_files"]
source = '''
  . = {
    "timestamp": to_string!(.timestamp),
    "source": "Linux-File",
    "event_id": "Syslog",
    "severity": "info",
    "message": to_string!(.message),
    "hostname": to_string!(.host),
    "username": "N/A",
    "raw_log": encode_json(.)
  }
'''

[sinks.send_to_dashboard]
type = "http"
inputs = ["format_journal", "format_files"]
uri = "http://$SOC_IP:8000/api/logs/ingest"
method = "post"
encoding.codec = "json"
request.timeout_secs = 60
batch.max_events = 500
EOF

echo "4. Creating systemd service..."
cat > /etc/systemd/system/vector.service << EOF
[Unit]
Description=Vector SOC Log Agent
After=network-online.target
Requires=network-online.target

[Service]
User=root
ExecStart=/usr/local/bin/vector --config /etc/vector/vector.toml
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=5
Environment="VECTOR_LOG=info"

[Install]
WantedBy=multi-user.target
EOF

echo "5. Starting Vector service..."
systemctl daemon-reload
systemctl enable vector
systemctl restart vector

echo ""
echo "========================================================"
echo "SUCCESS! The Linux Agent is installed and running."
echo "Logs are now being securely streamed to $SOC_IP"
echo "To view status: sudo systemctl status vector"
echo "========================================================"

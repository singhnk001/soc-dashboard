param (
    [Parameter(Mandatory=$true, HelpMessage="Enter the IP Address of your SOC Dashboard server (e.g., 192.168.1.50)")]
    [string]$SocServerIP
)

# Ensure running as Admin
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warning "Please run this script as Administrator!"
    exit
}

$InstallDir = "C:\Program Files\SOC_Vector_Agent"

Write-Host "1. Creating installation directory at $InstallDir..."
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path "$InstallDir\vector_data" | Out-Null

Write-Host "2. Downloading Vector Agent (v0.58.0)..."
$ZipPath = "$InstallDir\vector.zip"
Invoke-WebRequest -Uri "https://github.com/vectordotdev/vector/releases/download/v0.58.0/vector-0.58.0-x86_64-pc-windows-msvc.zip" -OutFile $ZipPath
Expand-Archive -Path $ZipPath -DestinationPath $InstallDir -Force
Move-Item -Path "$InstallDir\bin\vector.exe" -Destination "$InstallDir\vector.exe" -Force
Remove-Item -Path $ZipPath -Force

Write-Host "3. Generating configuration file..."
$TomlContent = @"
[sources.windows_events]
type = "windows_event_log"
channels = ["Security", "System", "Application"]
data_dir = "$($InstallDir.Replace("\", "\\"))\\vector_data"
read_existing_events = true

[transforms.format_for_api]
type = "remap"
inputs = ["windows_events"]
source = """
  event_id = to_string!(.event_id || "Unknown")
  hostname = to_string!(.computer || "Unknown")
  severity = "info"
  if .level == "Critical" { severity = "critical" }
  else if .level == "Error" { severity = "high" }
  else if .level == "Warning" { severity = "medium" }
  . = {
    "timestamp": to_string!(.timestamp),
    "source": "Windows-" + to_string!(.channel || "Unknown"),
    "event_id": event_id,
    "severity": severity,
    "message": to_string!(.message || ("Windows Event " + event_id)),
    "hostname": hostname,
    "username": to_string!(.user.identifier || "N/A"),
    "raw_log": encode_json(.)
  }
"""

[sinks.send_to_dashboard]
type = "http"
inputs = ["format_for_api"]
uri = "http://${SocServerIP}:8000/api/logs/ingest"
method = "post"
encoding.codec = "json"
request.timeout_secs = 60
batch.max_events = 500
"@
Set-Content -Path "$InstallDir\vector.toml" -Value $TomlContent -Encoding UTF8

Write-Host "4. Creating background startup wrapper..."
$BatContent = @"
@echo off
cd /d "$InstallDir"
"$InstallDir\vector.exe" --config "$InstallDir\vector.toml"
"@
Set-Content -Path "$InstallDir\start_agent.bat" -Value $BatContent -Encoding ASCII

Write-Host "5. Registering Windows Service (Scheduled Task)..."
schtasks /create /tn "SOC_Endpoint_Agent" /tr "$InstallDir\start_agent.bat" /sc onstart /ru SYSTEM /rl HIGHEST /F | Out-Null
schtasks /run /tn "SOC_Endpoint_Agent" | Out-Null

Write-Host ""
Write-Host "========================================================"
Write-Host "SUCCESS! The Vector Agent is installed and running."
Write-Host "Logs are now being securely streamed to $SocServerIP"
Write-Host "========================================================"

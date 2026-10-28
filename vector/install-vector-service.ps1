# Run as Administrator
# PowerShell 5 compatible - no &&, no sc.exe quoting issues

$vectorExe    = "C:\Program Files\Vector\bin\vector.exe"
$vectorConfig = "D:\SOC-Dashboard\Dashboard\vector\vector-windows-agent.toml"
$serviceName  = "VectorAgent"
$displayName  = "Vector Log Collector (SOC Dashboard)"
$description  = "Collects Windows Event Logs and forwards to SOC Dashboard API"

# Remove existing service if present
$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Stopping and removing existing service..."
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    (Get-WmiObject Win32_Service -Filter "Name='$serviceName'").Delete()
    Start-Sleep -Seconds 2
}

# Create service using New-Service (no sc.exe quoting issues)
Write-Host "Creating service..."
New-Service `
    -Name $serviceName `
    -BinaryPathName "`"$vectorExe`" --config `"$vectorConfig`"" `
    -DisplayName $displayName `
    -Description $description `
    -StartupType Automatic

# Verify it was created
$svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Host "ERROR: Service creation failed."
    exit 1
}

Write-Host "Service created: $($svc.DisplayName)"

# Set recovery: restart on failure (via sc.exe - only needed after service exists)
sc.exe failure $serviceName reset= 60 actions= restart/5000/restart/10000/restart/30000

# Start it
Write-Host "Starting service..."
Start-Service -Name $serviceName
Start-Sleep -Seconds 3

$svc = Get-Service -Name $serviceName
Write-Host "Status: $($svc.Status)"

if ($svc.Status -eq "Running") {
    Write-Host ""
    Write-Host "SUCCESS: VectorAgent is running and set to auto-start on reboot."
} else {
    Write-Host "WARNING: Service created but not running. Check Event Viewer for errors."
}

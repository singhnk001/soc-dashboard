# launch-collector.ps1 -- Kill all non-service Vector, reset state, start new collector
param([switch]$Force)

$DataDir  = "D:\SOC-Dashboard\Dashboard\vector\data3"
$TomlPath = "D:\SOC-Dashboard\Dashboard\vector\vector-soc-collector.toml"
$VectorExe = "D:\SOC-Dashboard\Dashboard\vector\bin\vector.exe"
$ErrLog   = "$DataDir\vector_err.log"

# Ensure data dir exists
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }

Write-Host "[1] Killing non-service Vector processes..."
Get-Process vector -EA SilentlyContinue | Where-Object {$_.Id -ne 20032} | ForEach-Object {
    Write-Host "    Killing PID $($_.Id)"
    Stop-Process -Id $_.Id -Force -EA SilentlyContinue
}
Start-Sleep 3

# Check port 8687 is free
$port8687 = netstat -ano 2>$null | Select-String ":8687 " | Select-String "LISTEN"
if ($port8687) {
    Write-Host "[!] Port 8687 still bound -- waiting 3s more..."
    Start-Sleep 3
}

Write-Host "[2] Resetting state files to current position..."
$secId = (Get-WinEvent -LogName Security -MaxEvents 1 -EA SilentlyContinue).RecordId
$sysId = (Get-WinEvent -LogName System   -MaxEvents 1 -EA SilentlyContinue).RecordId
$appId = (Get-WinEvent -LogName Application -MaxEvents 1 -EA SilentlyContinue).RecordId
if ($secId) { [System.IO.File]::WriteAllText("$DataDir\state_Security.txt",    [string]($secId - 5)) }
if ($sysId) { [System.IO.File]::WriteAllText("$DataDir\state_System.txt",      [string]($sysId - 5)) }
if ($appId) { [System.IO.File]::WriteAllText("$DataDir\state_Application.txt", [string]($appId - 5)) }
Write-Host "    Sec=$($secId-5) Sys=$($sysId-5) App=$($appId-5)"

Write-Host "[3] Starting Vector with soc-collector TOML..."
$proc = Start-Process -FilePath $VectorExe `
    -ArgumentList "--config",$TomlPath `
    -RedirectStandardError $ErrLog `
    -NoNewWindow -PassThru
Write-Host "    Vector PID: $($proc.Id)"

Write-Host "[4] Waiting 8s for startup..."
Start-Sleep 8

if (Get-Process -Id $proc.Id -EA SilentlyContinue) {
    Write-Host "[OK] Vector is running (PID $($proc.Id))"
    $listen = netstat -ano 2>$null | Select-String ":8687 " | Select-String "LISTEN"
    if ($listen) { Write-Host "[OK] Port 8687 LISTENING" } else { Write-Host "[!] Port 8687 not listening yet" }
    # Show last 5 lines of error log
    if (Test-Path $ErrLog) {
        Write-Host "--- Vector log (last 5 lines) ---"
        Get-Content $ErrLog | Select-Object -Last 5
    }
} else {
    Write-Host "[FAIL] Vector exited. Error log:"
    if (Test-Path $ErrLog) { Get-Content $ErrLog | Select-Object -Last 20 }
}

# collect-events.ps1
# Collects ALL Windows Event Log entries incrementally and outputs NDJSON to stdout.
# Called by Vector exec source every N seconds. No event ID filter -- captures everything.
# Uses System.Diagnostics.Eventing.Reader.EventLogQuery (no RPC, works in service context).

param(
    [string]$LogName   = "Security",
    [int]   $MaxEvents = 200
)

$ErrorActionPreference = "SilentlyContinue"

# ── Paths ──────────────────────────────────────────────────────────────────────
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir   = "D:\SOC-Dashboard\Dashboard\vector\data3"
$StateFile = Join-Path $DataDir "state_$($LogName -replace '[\\\/:]','_').txt"
$ErrorLog  = Join-Path $DataDir "collect_errors.log"

if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }

function Write-Err([string]$msg) {
    $ts = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
    Add-Content -Path $ErrorLog -Value "[$ts][$LogName] $msg" -ErrorAction SilentlyContinue
}

# ── Severity by Event Level (Windows standard) ───────────────────────────────
# Level 1=Critical, 2=Error, 3=Warning, 4=Information, 5=Verbose/Debug
$LevelToSeverity = @{ 1 = "critical"; 2 = "high"; 3 = "medium"; 4 = "info"; 5 = "low"; 0 = "info" }

# ── Security event severity overrides (specific IDs that matter for SOC) ─────
$SecuritySeverity = @{
    4625 = "high"; 4740 = "high"; 4771 = "high"; 4697 = "high";
    4698 = "high"; 4699 = "high"; 4700 = "high"; 4701 = "high";
    4702 = "high"; 4725 = "high"; 4726 = "high"; 1102 = "critical";
    4672 = "medium"; 4648 = "medium"; 4663 = "medium"; 4673 = "medium";
    4688 = "low"; 4624 = "info"; 4634 = "info"; 4647 = "info"
}

# ── Load last RecordId ─────────────────────────────────────────────────────────
$LastRecordId = 0
if (Test-Path $StateFile) {
    $val = (Get-Content $StateFile -Raw -ErrorAction SilentlyContinue) -replace '\s',''
    if ($val -match '^\d+$') { $LastRecordId = [long]$val }
}

# ── Build XPath to get all events after LastRecordId ─────────────────────────
$xpath = if ($LastRecordId -gt 0) {
    "*[System[EventRecordID > $LastRecordId]]"
} else {
    "*"
}

# ── Collect using .NET EventLogQuery (no RPC -- safe in service/LocalSystem) ──
$AllRecords = [System.Collections.Generic.List[object]]::new()

try {
    $query  = New-Object System.Diagnostics.Eventing.Reader.EventLogQuery(
        $LogName,
        [System.Diagnostics.Eventing.Reader.PathType]::LogName,
        $xpath
    )
    $reader = New-Object System.Diagnostics.Eventing.Reader.EventLogReader($query)
    $count  = 0
    while ($count -lt $MaxEvents) {
        try {
            $record = $reader.ReadEvent()
            if ($record -eq $null) { break }
            $AllRecords.Add($record)
            $count++
        } catch { break }
    }
    $reader.Dispose()
} catch {
    $msg = $_.Exception.Message
    if ($msg -notmatch "No events" -and $msg -notmatch "no results" -and $msg -notmatch "The handle is invalid") {
        Write-Err "EventLogQuery error for '$LogName': $msg"
    }
    exit 0
}

if ($AllRecords.Count -eq 0) { exit 0 }

# ── Drop events older than 6 hours (backlog protection)
\ = (Get-Date).AddHours(-6).ToUniversalTime()
\ = [System.Collections.Generic.List[object]](\ | Where-Object { \.TimeCreated -ne \ -and \.TimeCreated.ToUniversalTime() -ge \ })
if (\.Count -eq 0) { exit 0 }

# ── Sort ascending by RecordId ─────────────────────────────────────────────────
$Sorted     = $AllRecords | Sort-Object { $_.RecordId }
$NewLastId  = 0

foreach ($ev in $Sorted) {
    $recId = $ev.RecordId
    if ($recId -ne $null -and $recId -gt $NewLastId) { $NewLastId = [long]$recId }

    # ── Extract fields from XML (works without interactive window station) ────
    $extracted = @{}
    try {
        $evXml   = $ev.ToXml()
        [xml]$xd = $evXml
        $nodes   = $xd.Event.EventData.Data
        if ($nodes) {
            foreach ($node in $nodes) {
                if ($node.Name -and $node.InnerText) {
                    $key = ($node.Name -replace '\s+','_' -replace '[^a-zA-Z0-9_]','').ToLower()
                    $val = $node.InnerText.Trim()
                    if ($val -ne '' -and $val -ne '-' -and $val -ne '%%1833' -and $val.Length -lt 512) {
                        $extracted[$key] = $val
                    }
                }
            }
        }
        # UserData for events that use it instead of EventData
        if ($extracted.Count -eq 0 -and $xd.Event.UserData) {
            $ud = $xd.Event.UserData.FirstChild
            if ($ud) {
                foreach ($child in $ud.ChildNodes) {
                    if ($child.LocalName -and $child.InnerText) {
                        $key = ($child.LocalName -replace '[^a-zA-Z0-9_]','_').ToLower()
                        $val = $child.InnerText.Trim()
                        if ($val -ne '' -and $val.Length -lt 512) {
                            $extracted[$key] = $val
                        }
                    }
                }
            }
        }
    } catch { }

    # ── Common field extraction ───────────────────────────────────────────────
    $username = $null
    foreach ($k in @("subjectusername","targetusername","accountname","samaccountname","username")) {
        if ($extracted.ContainsKey($k) -and $extracted[$k] -ne "" -and $extracted[$k] -ne "-") {
            $username = $extracted[$k]; break
        }
    }

    $srcIp = $null
    foreach ($k in @("ipaddress","sourceaddress","networkaddress","clientaddress")) {
        if ($extracted.ContainsKey($k) -and $extracted[$k] -ne "" -and $extracted[$k] -ne "-" -and $extracted[$k] -ne "::1" -and $extracted[$k] -ne "127.0.0.1") {
            $srcIp = $extracted[$k]; break
        }
    }

    $processName = $null
    foreach ($k in @("newprocessname","processname","imagepath","applicationname")) {
        if ($extracted.ContainsKey($k) -and $extracted[$k] -ne "" -and $extracted[$k] -ne "-") {
            $processName = $extracted[$k]; break
        }
    }

    $logonType = if ($extracted.ContainsKey("logontype")) { $extracted["logontype"] } else { $null }

    # ── Severity ──────────────────────────────────────────────────────────────
    $evId = [int]$ev.Id
    $lvl  = if ($ev.Level -ne $null) { [int]$ev.Level } else { 4 }
    $sev  = if ($LevelToSeverity.ContainsKey($lvl)) { $LevelToSeverity[$lvl] } else { "info" }
    if ($LogName -eq "Security" -and $SecuritySeverity.ContainsKey($evId)) {
        $sev = $SecuritySeverity[$evId]
    }

    # ── Message: try provider name + EventID (readable, no FormatDescription) ─
    $provName  = if ($ev.ProviderName) { $ev.ProviderName } else { "Unknown" }
    $shortMsg  = "$provName EventID $evId"

    # ── Timestamp ─────────────────────────────────────────────────────────────
    $ts = "1970-01-01T00:00:00.000Z"
    try {
        if ($ev.TimeCreated -ne $null) {
            $ts = $ev.TimeCreated.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        }
    } catch { }

    # ── Normalize log type label ───────────────────────────────────────────────
    $logType = switch ($LogName) {
        "Security"    { "Security" }
        "System"      { "System" }
        "Application" { "Application" }
        "Windows PowerShell" { "PowerShell" }
        "Microsoft-Windows-PowerShell/Operational" { "PowerShell" }
        "Microsoft-Windows-Windows Defender/Operational" { "Defender" }
        default       { $LogName -replace 'Microsoft-Windows-','' -replace '/Operational','' -replace '/Admin','' }
    }

    # ── Build raw_log ─────────────────────────────────────────────────────────
    $rawLog = [ordered]@{
        provider         = $provName
        record_id        = $recId
        log_name         = $ev.LogName
        level            = $lvl
        task             = $ev.Task
        opcode           = $ev.Opcode
        extracted_fields = $extracted
    }
    if ($srcIp)       { $rawLog["source_ip"]    = $srcIp }
    if ($logonType)   { $rawLog["logon_type"]   = $logonType }
    if ($processName) { $rawLog["process_name"] = $processName }

    # ── Output NDJSON ─────────────────────────────────────────────────────────
    $out = [ordered]@{
        timestamp = $ts
        hostname  = $env:COMPUTERNAME
        source    = $logType
        event_id  = [string]$evId
        severity  = $sev
        message   = $shortMsg
        log_type  = "Windows Event"
        raw_log   = ($rawLog | ConvertTo-Json -Compress -Depth 3)
    }
    if ($username)    { $out["username"]    = $username }
    if ($srcIp)       { $out["source_ip"]   = $srcIp }
    if ($processName) { $out["process_name"] = $processName }

    try {
        Write-Output ($out | ConvertTo-Json -Compress -Depth 2)
    } catch {
        Write-Err "JSON error RecordId $recId : $_"
    }
}

# ── Save state ────────────────────────────────────────────────────────────────
if ($NewLastId -gt 0) {
    Set-Content -Path $StateFile -Value ([string]$NewLastId) -Force -ErrorAction SilentlyContinue
}

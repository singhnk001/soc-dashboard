# collect-events3.ps1
# Collects Windows Event Log entries incrementally, outputs NDJSON to stdout.
# Uses .NET EventLogQuery (no RPC, works in LocalSystem service context).
# State stored in data3\ -- isolated from the locked VectorAgent service.

param(
    [string]$LogName    = "Security",
    [string]$Channel    = "",          # alias passed by Vector TOML
    [string]$StateFile  = "",          # explicit state file path from TOML
    [int]   $MaxEvents  = 200
)

# -Channel overrides -LogName (Vector TOML passes -Channel)
if ($Channel -ne "") { $LogName = $Channel }

$ErrorActionPreference = "SilentlyContinue"

$DataDir   = "D:\SOC-Dashboard\Dashboard\vector\data3"
# Use explicit StateFile if provided, otherwise derive from LogName
if ($StateFile -eq "") {
    $StateFile = Join-Path $DataDir ("state_" + ($LogName -replace '[\\\/:]','_') + ".txt")
}
$ErrorLog  = Join-Path $DataDir "collect_errors.log"

if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }

function Write-Err($msg) {
    try { Add-Content -Path $ErrorLog -Value "$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') [$LogName] $msg" } catch {}
}

# Read last processed RecordId
$LastRecordId = 0
if (Test-Path $StateFile) {
    $raw = [System.IO.File]::ReadAllText($StateFile)
    $val = $raw -replace '\s',''
    if ($val -match '^\d+$') { $LastRecordId = [long]$val }
}

# Time cutoff -- skip events older than 8 hours
$CutoffUtc = [DateTime]::UtcNow.AddHours(-8)

# Build XPath
if ($LastRecordId -gt 0) {
    $XPath = "*[System[EventRecordID > $LastRecordId]]"
} else {
    $tsStr = $CutoffUtc.ToString("yyyy-MM-ddTHH:mm:ss")
    $XPath = "*[System[TimeCreated[@SystemTime >= '$tsStr']]]"
}

# Event name map
$EventNames = @{
    4624='Logon'; 4625='Failed Logon'; 4634='Logoff'; 4648='Explicit Logon'
    4656='Object Access'; 4657='Registry Value Modified'; 4663='Object Access Attempt'
    4672='Special Privileges'; 4673='Privileged Service Called'
    4688='Process Created'; 4689='Process Exited'
    4697='Service Installed'; 4698='Scheduled Task Created'; 4699='Scheduled Task Deleted'
    4700='Scheduled Task Enabled'; 4701='Scheduled Task Disabled'; 4702='Scheduled Task Updated'
    4719='Audit Policy Changed'; 4720='User Account Created'
    4722='User Account Enabled'; 4723='Password Change Attempt'; 4724='Password Reset'
    4725='User Account Disabled'; 4726='User Account Deleted'
    4728='Member Added to Security Group'; 4732='Member Added to Local Group'
    4740='Account Lockout'; 4756='Member Added to Universal Group'
    4768='Kerberos TGT'; 4769='Kerberos Service Ticket'; 4771='Kerberos Pre-Auth Failed'
    4776='NTLM Auth'; 4798='Local Group Enum'; 4799='Security Group Enum'
    1102='Audit Log Cleared'; 4616='System Time Changed'
    7034='Service Crashed'; 7035='Service Control'; 7036='Service State Change'
    7040='Service Start Type Changed'; 7045='New Service Installed'
    1116='Defender Malware Detected'; 1117='Defender Action Taken'
    4103='PowerShell Module Log'; 4104='PowerShell Script Block'
}

$SeverityMap = @{
    4625='critical'; 4740='critical'; 1102='critical'; 4697='critical'
    4698='critical'; 1116='critical'; 1117='critical'; 4719='critical'
    4648='high'; 4672='high'; 4688='high'; 4720='high'; 4726='high'
    4728='high'; 4732='high'; 4776='high'; 7045='high'; 4104='high'
    4624='medium'; 4634='medium'; 4663='medium'; 4768='medium'; 4769='medium'
    4771='medium'; 4722='medium'; 4723='medium'; 4724='medium'; 4725='medium'
    7034='medium'; 7036='medium'
}

# Open log reader
try {
    $query  = New-Object System.Diagnostics.Eventing.Reader.EventLogQuery($LogName, [System.Diagnostics.Eventing.Reader.PathType]::LogName, $XPath)
    $reader = New-Object System.Diagnostics.Eventing.Reader.EventLogReader($query)
} catch {
    Write-Err "Cannot open '$LogName': $_"
    exit 0
}

$events = [System.Collections.Generic.List[object]]::new()
$n = 0
while ($n -lt $MaxEvents) {
    $ev = $null
    try { $ev = $reader.ReadEvent() } catch { break }
    if ($ev -eq $null) { break }
    $events.Add($ev)
    $n++
}
$reader.Dispose()

$NewLastId = 0

foreach ($ev in $events) {
    $recId = 0
    $evId  = 0
    $ts    = $null

    try {
        [xml]$xml = $ev.ToXml()
        $sys = $xml.Event.System

        $recId = [long]$sys.EventRecordID

        # Always advance state pointer FIRST (before any parse that might fail)
        if ($recId -gt $NewLastId) { $NewLastId = $recId }

        # EventID can be a simple text node OR have a Qualifiers attribute with text content
        $raw_evid = $sys.EventID.'#text'
        if (-not $raw_evid -or $raw_evid -eq '') { $raw_evid = ([string]$sys.EventID) -replace '\D','' }
        if (-not $raw_evid -or $raw_evid -eq '') { $raw_evid = '0' }
        $evId  = [int]$raw_evid

        $ts    = [DateTime]::Parse($sys.TimeCreated.SystemTime).ToUniversalTime()

        # Skip old events
        if ($ts -lt $CutoffUtc) { continue }

        $computer = [string]$sys.Computer
        $level    = [int]$sys.Level
        $provider = [string]$sys.Provider.Name

        # Extract EventData
        $evData = @{}
        if ($xml.Event.EventData -ne $null -and $xml.Event.EventData.Data -ne $null) {
            foreach ($d in @($xml.Event.EventData.Data)) {
                $dn = $d.Name; $dv = $d.'#text'
                if ($dn -and $dv) { $evData[$dn] = $dv }
            }
        }

        # Key fields
        $username = $null
        foreach ($k in @('SubjectUserName','TargetUserName','AccountName')) {
            if ($evData[$k] -and $evData[$k] -ne '-' -and $evData[$k] -ne 'SYSTEM') {
                $username = $evData[$k]; break
            }
        }

        $srcIp = $null
        foreach ($k in @('IpAddress','SourceAddress','ClientAddress')) {
            if ($evData[$k] -and $evData[$k] -ne '-' -and $evData[$k] -ne '::1' -and $evData[$k] -ne '127.0.0.1') {
                $srcIp = $evData[$k]; break
            }
        }

        $processName = $null
        foreach ($k in @('NewProcessName','ProcessName','Application')) {
            if ($evData[$k] -and $evData[$k] -ne '-') {
                $processName = Split-Path -Leaf $evData[$k]; break
            }
        }

        # Build message
        $evName = if ($EventNames.ContainsKey($evId)) { $EventNames[$evId] } else { "EventID $evId" }
        $parts  = [System.Collections.Generic.List[string]]::new()
        $parts.Add($evName)
        if ($username)    { $parts.Add("User:$username") }
        if ($processName) { $parts.Add("Process:$processName") }
        if ($srcIp)       { $parts.Add("From:$srcIp") }
        $shortMsg = $parts -join ' | '

        # Severity
        $sev = if ($SeverityMap.ContainsKey($evId)) { $SeverityMap[$evId] }
               elseif ($level -le 1) { 'critical' }
               elseif ($level -eq 2) { 'high' }
               elseif ($level -eq 3) { 'medium' }
               else { 'low' }

        $tsOut = $ts.ToString("yyyy-MM-ddTHH:mm:ssZ")

        # Compact raw_log
        $rawLog = [ordered]@{ event_id = $evId; record_id = $recId; provider = $provider }
        $evData.Keys | Select-Object -First 8 | ForEach-Object { $rawLog[$_] = $evData[$_] }

        $out = [ordered]@{
            timestamp  = $tsOut
            hostname   = $computer
            source     = $LogName
            event_id   = ([string]$evId)
            severity   = $sev
            message    = $shortMsg
            log_type   = "Windows Event"
            raw_log    = ($rawLog | ConvertTo-Json -Compress -Depth 2)
        }
        if ($username)    { $out["username"]     = $username }
        if ($srcIp)       { $out["source_ip"]    = $srcIp }
        if ($processName) { $out["process_name"] = $processName }

        Write-Output ($out | ConvertTo-Json -Compress -Depth 2)

    } catch {
        Write-Err "Parse error RecordId=$recId EventId=$evId : $_"
        # recId may be 0 if xml parse itself failed -- still advance if we have it
        if ($recId -gt 0 -and $recId -gt $NewLastId) { $NewLastId = $recId }
    }
}

# Save state without trailing newline
if ($NewLastId -gt 0) {
    [System.IO.File]::WriteAllText($StateFile, [string]$NewLastId)
}

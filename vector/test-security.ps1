try {
    $events = Get-WinEvent -LogName Security -FilterXPath '*[System[(EventID=4624 or EventID=4634 or EventID=4672)]]' -MaxEvents 5 -ErrorAction Stop
    Write-Host "Security filtered events: $($events.Count)"
    foreach ($ev in $events) {
        Write-Host "  RecordId=$($ev.RecordId) EventId=$($ev.Id) Time=$($ev.TimeCreated)"
    }
} catch [System.UnauthorizedAccessException] {
    Write-Host "Access denied (non-admin shell) - this is expected; service (LocalSystem) has access"
} catch {
    Write-Host "Error: $_"
}

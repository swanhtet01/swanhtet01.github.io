param(
    [string]$BaseUrl = "http://127.0.0.1:8787",
    [string]$Username = "owner",
    [string]$Password = "supermega-demo",
    [string]$Workspace = "supermega-lab",
    [string]$Query = "spa in yangon",
    [switch]$AsJson
)

$ErrorActionPreference = "Stop"

function Invoke-JsonRequest {
    param(
        [string]$Method,
        [string]$Url,
        [Microsoft.PowerShell.Commands.WebRequestSession]$Session,
        [object]$Body = $null
    )

    $params = @{
        Uri         = $Url
        Method      = $Method
        WebSession  = $Session
        TimeoutSec  = 10
        ErrorAction = "Stop"
    }

    if ($null -ne $Body) {
        $params.ContentType = "application/json"
        $params.Body = ($Body | ConvertTo-Json -Depth 10)
    }

    return Invoke-RestMethod @params
}

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

$health = Invoke-JsonRequest -Method "GET" -Url "$BaseUrl/api/health" -Session $session
$login = Invoke-JsonRequest -Method "POST" -Url "$BaseUrl/api/auth/login" -Session $session -Body @{
    username       = $Username
    password       = $Password
    workspace_slug = $Workspace
}
$summary = Invoke-JsonRequest -Method "GET" -Url "$BaseUrl/api/summary" -Session $session
$director = Invoke-JsonRequest -Method "GET" -Url "$BaseUrl/api/reports/role/director" -Session $session
$exceptions = Invoke-JsonRequest -Method "GET" -Url "$BaseUrl/api/exceptions?limit=5" -Session $session
$leadFinder = Invoke-JsonRequest -Method "POST" -Url "$BaseUrl/api/tools/lead-finder" -Session $session -Body @{
    query    = $Query
    keywords = @("spa", "wellness", "massage", "yangon")
    sources  = @("web", "maps")
    limit    = 4
}

$report = [pscustomobject]@{
    base_url           = $BaseUrl
    health_status      = $health.status
    login_status       = $login.status
    authenticated      = [bool]$login.authenticated
    workspace_slug     = $login.session.workspace_slug
    action_count       = [int]($summary.actions.total_items | ForEach-Object { $_ })
    supplier_risk_count = [int]($summary.supplier_watch.risk_count | ForEach-Object { $_ })
    quality_incident_count = [int]($summary.quality.incident_count | ForEach-Object { $_ })
    director_priority_count = [int]($director.count | ForEach-Object { $_ })
    exception_count    = [int]($exceptions.count | ForEach-Object { $_ })
    lead_count         = @($leadFinder.rows).Count
    top_lead           = if (@($leadFinder.rows).Count -gt 0) { $leadFinder.rows[0].name } else { "" }
    provider           = $leadFinder.provider
    timestamp          = (Get-Date).ToString("o")
}

if ($AsJson) {
    $report | ConvertTo-Json -Depth 6
}
else {
    Write-Host ""
    Write-Host "SuperMega app smoke test"
    Write-Host ("- Base URL: " + $report.base_url)
    Write-Host ("- Health: " + $report.health_status)
    Write-Host ("- Login: " + $report.login_status + " / authenticated=" + $report.authenticated)
    Write-Host ("- Workspace: " + $report.workspace_slug)
    Write-Host ("- Actions: " + $report.action_count)
    Write-Host ("- Supplier risks: " + $report.supplier_risk_count)
    Write-Host ("- Quality incidents: " + $report.quality_incident_count)
    Write-Host ("- Director priorities: " + $report.director_priority_count)
    Write-Host ("- Exceptions: " + $report.exception_count)
    Write-Host ("- Lead finder rows: " + $report.lead_count)
    Write-Host ("- Top lead: " + $report.top_lead)
    Write-Host ("- Provider: " + $report.provider)
    Write-Host ""
}

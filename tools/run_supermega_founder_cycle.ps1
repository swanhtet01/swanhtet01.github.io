param(
  [string]$BaseUrl = "https://supermega-app-453184845544.asia-southeast1.run.app",
  [string]$PublicUrl = "https://supermega.dev",
  [string]$Username = "",
  [string]$Password = "",
  [string]$Workspace = "",
  [string]$PythonPath = "",
  [string]$RunId = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-PythonPath {
  param([string]$RequestedPath)

  if ($RequestedPath -and (Test-Path -LiteralPath $RequestedPath)) {
    return $RequestedPath
  }

  $candidate = Join-Path $env:USERPROFILE "OneDrive - BDA\.venv\Scripts\python.exe"
  if (Test-Path -LiteralPath $candidate) {
    return $candidate
  }

  return "python"
}

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Url,
    [object]$Body = $null,
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session
  )

  $params = @{
    Uri = $Url
    Method = $Method
    WebSession = $Session
    Headers = @{ Accept = "application/json" }
    ContentType = "application/json"
  }

  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 8)
  }

  return Invoke-RestMethod @params
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$python = Resolve-PythonPath -RequestedPath $PythonPath
$smokeScript = Join-Path $PSScriptRoot "smoke_test_supermega_app.py"
$jobScript = Join-Path $PSScriptRoot "run_supermega_agent_jobs.py"
$operatorScript = Join-Path $PSScriptRoot "run_supermega_operator_cycle.ps1"

if ([string]::IsNullOrWhiteSpace($Username)) {
  $Username = $env:SUPERMEGA_AGENT_USERNAME
}
if ([string]::IsNullOrWhiteSpace($Password)) {
  $Password = $env:SUPERMEGA_AGENT_PASSWORD
}
if ([string]::IsNullOrWhiteSpace($Workspace)) {
  $Workspace = $env:SUPERMEGA_AGENT_WORKSPACE
}
if ([string]::IsNullOrWhiteSpace($Workspace)) {
  $Workspace = "supermega-lab"
}
if ([string]::IsNullOrWhiteSpace($Username) -or [string]::IsNullOrWhiteSpace($Password)) {
  throw "Set SUPERMEGA_AGENT_USERNAME and SUPERMEGA_AGENT_PASSWORD before running the founder cycle."
}

$operatorArgs = @(
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  $operatorScript,
  "-BaseUrl",
  $BaseUrl,
  "-PublicUrl",
  $PublicUrl
)
if (-not [string]::IsNullOrWhiteSpace($RunId)) {
  $operatorArgs += @("-RunId", $RunId)
}

$operatorJson = & powershell @operatorArgs
$operator = $operatorJson | Out-String | ConvertFrom-Json

$env:SUPERMEGA_AGENT_USERNAME = $Username
$env:SUPERMEGA_AGENT_PASSWORD = $Password
$env:SUPERMEGA_AGENT_WORKSPACE = $Workspace
$agentJobsJson = & $python $jobScript --base-url $BaseUrl --workspace $Workspace --as-json
if ($LASTEXITCODE -ne 0) {
  throw "Agent job runner rejected the target or failed before the founder login."
}
$agentJobs = $agentJobsJson | Out-String | ConvertFrom-Json

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$login = Invoke-Json -Method "POST" -Url "$($BaseUrl.TrimEnd('/'))/api/auth/login" -Body @{
  username = $Username
  password = $Password
  workspace_slug = $Workspace
} -Session $session

if ($login.status -ne "ready") {
  throw "Founder cycle login failed."
}

$agentTeams = Invoke-Json -Method "GET" -Url "$($BaseUrl.TrimEnd('/'))/api/agent-teams" -Session $session
$summary = Invoke-Json -Method "GET" -Url "$($BaseUrl.TrimEnd('/'))/api/summary" -Session $session
$agentRuns = Invoke-Json -Method "GET" -Url "$($BaseUrl.TrimEnd('/'))/api/agent-runs?limit=12" -Session $session

$report = [ordered]@{
  checked_at = (Get-Date).ToString("s")
  base_url = $BaseUrl
  public_url = $PublicUrl
  operator = $operator
  agent_jobs = $agentJobs
  agent_team = [ordered]@{
    status = $agentTeams.status
    summary = $agentTeams.summary
    gaps = $agentTeams.gaps
    next_moves = $agentTeams.next_moves
    team_names = @($agentTeams.teams | ForEach-Object { $_.name })
  }
  founder = [ordered]@{
    actions_total = $summary.actions.total_items
    approvals_total = $summary.approvals.approval_count
    agent_autonomy = $summary.agent_system.autonomy_score
    team_count = $summary.agent_system.team_count
    top_priorities = $summary.review.top_priorities
  }
  latest_agent_runs = @($agentRuns.rows | Select-Object -First 8)
}

$report | ConvertTo-Json -Depth 8

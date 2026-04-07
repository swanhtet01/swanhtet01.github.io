param(
  [string]$BaseUrl = "https://supermega-app-453184845544.asia-southeast1.run.app",
  [string]$PublicUrl = "https://supermega.dev",
  [string]$PythonPath = "",
  [string]$OutputDir = "",
  [switch]$Daily
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

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  Join-Path $repoRoot "pilot-data\ops"
} else {
  $OutputDir
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$python = Resolve-PythonPath -RequestedPath $PythonPath
$founderScript = Join-Path $PSScriptRoot "run_supermega_founder_cycle.ps1"
$operatorScript = Join-Path $PSScriptRoot "run_supermega_operator_cycle.ps1"
$agentRunner = Join-Path $PSScriptRoot "run_supermega_agent_jobs.py"
$syncOpsScript = Join-Path $PSScriptRoot "sync_supermega_ops_from_reports.ps1"
$renderOpsHubScript = Join-Path $PSScriptRoot "render_supermega_ops_hub.ps1"

$operatorJson = & powershell -ExecutionPolicy Bypass -File $operatorScript -BaseUrl $BaseUrl -PublicUrl $PublicUrl
$operatorPath = Join-Path $outputRoot "operator-cycle-latest.json"
$operatorArchivePath = Join-Path $outputRoot ("operator-cycle-{0}.json" -f $timestamp)
$operatorJson | Out-File -LiteralPath $operatorPath -Encoding utf8
$operatorJson | Out-File -LiteralPath $operatorArchivePath -Encoding utf8

$founderJson = & powershell -ExecutionPolicy Bypass -File $founderScript -BaseUrl $BaseUrl -PublicUrl $PublicUrl -PythonPath $python
$founderPath = Join-Path $outputRoot "founder-cycle-latest.json"
$founderArchivePath = Join-Path $outputRoot ("founder-cycle-{0}.json" -f $timestamp)
$founderJson | Out-File -LiteralPath $founderPath -Encoding utf8
$founderJson | Out-File -LiteralPath $founderArchivePath -Encoding utf8

$cronToken = ""
try {
  $cronToken = (gcloud secrets versions access latest --secret=supermega-internal-cron-token --project supermega-468612).Trim()
}
catch {
  $cronToken = ""
}

$jobArgs = @(
  $agentRunner,
  "--base-url", $BaseUrl,
  "--as-json"
)
if (-not [string]::IsNullOrWhiteSpace($cronToken)) {
  $env:SUPERMEGA_INTERNAL_CRON_TOKEN = $cronToken
}
$agentJson = & $python @jobArgs
$agentPath = Join-Path $outputRoot "agent-cycle-latest.json"
$agentArchivePath = Join-Path $outputRoot ("agent-cycle-{0}.json" -f $timestamp)
$agentJson | Out-File -LiteralPath $agentPath -Encoding utf8
$agentJson | Out-File -LiteralPath $agentArchivePath -Encoding utf8

$summary = [ordered]@{
  checked_at = (Get-Date).ToString("s")
  mode = if ($Daily) { "daily" } else { "cycle" }
  base_url = $BaseUrl
  public_url = $PublicUrl
  output_dir = $outputRoot
  files = [ordered]@{
    operator = $operatorPath
    founder = $founderPath
    agent = $agentPath
  }
}

$opsSyncJson = & powershell -ExecutionPolicy Bypass -File $syncOpsScript -RepoRoot $repoRoot -ReportsDir $outputRoot
$summary.ops_sync = $opsSyncJson | Out-String | ConvertFrom-Json

$opsHubJson = & powershell -ExecutionPolicy Bypass -File $renderOpsHubScript -RepoRoot $repoRoot
$summary.ops_hub = $opsHubJson | Out-String | ConvertFrom-Json

$summary | ConvertTo-Json -Depth 5 | Out-File -LiteralPath (Join-Path $outputRoot "workstation-latest.json") -Encoding utf8
$summary | ConvertTo-Json -Depth 5

param(
  [switch]$OpenApp,
  [switch]$ListOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = 'C:\Users\swann\AppData\Local\Temp\supermega-promote-20260404-1'
$OpsDir = Join-Path $Root 'Super Mega Inc\ops'
$paths = @(
  (Join-Path $OpsDir '33_daily_sales_sprint_runbook.md'),
  (Join-Path $OpsDir '34_daily_sales_sprint_today.csv'),
  (Join-Path $OpsDir '35_daily_sales_sprint_follow_up.csv'),
  (Join-Path $OpsDir '03_sales_pipeline.csv')
)
$existingPaths = @($paths | Where-Object { Test-Path -LiteralPath $_ })

if (-not $ListOnly) {
  foreach ($path in $existingPaths) {
    Start-Process $path
  }

  if ($OpenApp) {
    Start-Process 'https://app.supermega.dev/app/deals'
  }
}

[pscustomobject]@{
  status = 'ready'
  list_only = [bool]$ListOnly
  app_opened = [bool]($OpenApp -and -not $ListOnly)
  files = $existingPaths
} | ConvertTo-Json -Depth 4

param(
  [switch]$NoBrowser,
  [switch]$SkipSync,
  [switch]$SkipLocalHq
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = 'C:\Users\swann\AppData\Local\Temp\supermega-promote-20260404-1'
$SyncScript = Join-Path $Root 'tools\sync_supermega_codex_hq.ps1'
$RepoOpsHub = Join-Path $Root 'Super Mega Inc\ops\index.html'
$RepoRunbook = Join-Path $Root 'Super Mega Inc\ops\30_founder_local_access_runbook.md'
$BdaHqRoot = 'C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq'
$BdaOpsHub = Join-Path $BdaHqRoot 'ops\index.html'
$BdaRunbook = Join-Path $BdaHqRoot 'ops\30_founder_local_access_runbook.md'

$cloudSurfaces = @(
  'https://app.supermega.dev/app/director',
  'https://app.supermega.dev/app/teams',
  'https://app.supermega.dev/app/sales'
)

if (-not $SkipSync -and (Test-Path -LiteralPath $SyncScript)) {
  & powershell -ExecutionPolicy Bypass -File $SyncScript | Out-Null
}

if (-not $SkipLocalHq) {
  if (Test-Path -LiteralPath $BdaHqRoot) {
    Start-Process explorer.exe $BdaHqRoot
  }

  if (Test-Path -LiteralPath $BdaOpsHub) {
    Start-Process $BdaOpsHub
  } elseif (Test-Path -LiteralPath $RepoOpsHub) {
    Start-Process $RepoOpsHub
  }

  if (Test-Path -LiteralPath $BdaRunbook) {
    Start-Process $BdaRunbook
  } elseif (Test-Path -LiteralPath $RepoRunbook) {
    Start-Process $RepoRunbook
  }
}

if (-not $NoBrowser) {
  foreach ($surface in $cloudSurfaces) {
    Start-Process $surface
  }
}

[pscustomobject]@{
  status = 'ready'
  synced = (-not $SkipSync)
  local_hq_opened = (-not $SkipLocalHq)
  browser_opened = (-not $NoBrowser)
  bda_hq = $BdaHqRoot
  runbook = $BdaRunbook
  surfaces = $cloudSurfaces
} | ConvertTo-Json -Depth 4

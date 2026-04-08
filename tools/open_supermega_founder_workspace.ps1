param(
  [ValidateSet('live', 'local', 'mirror')]
  [string]$Mode = 'live',
  [switch]$NoBrowser,
  [switch]$SkipSync,
  [switch]$SkipLocalHq,
  [switch]$BuildShowroom
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = 'C:\Users\swann\AppData\Local\Temp\supermega-promote-20260404-1'
$SyncScript = Join-Path $Root 'tools\sync_supermega_codex_hq.ps1'
$StartStackScript = Join-Path $Root 'tools\start_supermega_stack.ps1'
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

$localSurfaces = @(
  'http://localhost:8787/app/dev-desk',
  'http://localhost:8787/app/agents',
  'http://localhost:8787/app/deals'
)

function Test-CommandInstalled {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Ensure-LocalStack {
  if (-not (Test-CommandInstalled -Name 'python')) {
    throw "Local HQ mode needs Python installed and available on PATH. Use live mode if you do not want to run the local stack."
  }

  if (-not (Test-CommandInstalled -Name 'npm')) {
    throw "Local HQ mode needs Node.js and npm installed and available on PATH. Use live mode if you do not want to run the local stack."
  }

  $stackArgs = @(
    '-ExecutionPolicy', 'Bypass',
    '-File', $StartStackScript,
    '-NoOpen'
  )
  if ($BuildShowroom) {
    $stackArgs += '-BuildShowroom'
  }

  & powershell @stackArgs
}

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

$surfaces = @()

switch ($Mode) {
  'live' {
    $surfaces = $cloudSurfaces
  }
  'local' {
    Ensure-LocalStack
    $surfaces = $localSurfaces
  }
  'mirror' {
    $surfaces = @()
  }
}

if (-not $NoBrowser) {
  foreach ($surface in $surfaces) {
    Start-Process $surface
  }
}

[pscustomobject]@{
  status = 'ready'
  mode = $Mode
  synced = (-not $SkipSync)
  local_hq_opened = (-not $SkipLocalHq)
  browser_opened = (-not $NoBrowser)
  bda_hq = $BdaHqRoot
  runbook = $BdaRunbook
  surfaces = $surfaces
} | ConvertTo-Json -Depth 4

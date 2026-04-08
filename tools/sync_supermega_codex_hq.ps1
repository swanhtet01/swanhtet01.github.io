param(
  [string]$RepoRoot = "",
  [string]$TargetRoot = "C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = Split-Path -Parent $PSScriptRoot
}

$opsDir = Join-Path $RepoRoot "Super Mega Inc\ops"
$reportsDir = Join-Path $RepoRoot "pilot-data\ops"
$siteDir = Join-Path $RepoRoot "showroom\public\site"
$brandDir = Join-Path $RepoRoot "showroom\public\brand"

$targetOpsDir = Join-Path $TargetRoot "ops"
$targetReportsDir = Join-Path $TargetRoot "reports"
$targetSiteDir = Join-Path $TargetRoot "site"
$targetBrandDir = Join-Path $TargetRoot "brand"

$syncOpsScript = Join-Path $PSScriptRoot "sync_supermega_ops_from_reports.ps1"
$renderOpsHubScript = Join-Path $PSScriptRoot "render_supermega_ops_hub.ps1"

function Ensure-Dir {
  param([string]$Path)
  New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

function Copy-DirectoryContents {
  param(
    [string]$Source,
    [string]$Destination,
    [string[]]$IncludePatterns = @("*")
  )

  Ensure-Dir -Path $Destination
  foreach ($pattern in $IncludePatterns) {
    Get-ChildItem -LiteralPath $Source -Filter $pattern -File | ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $Destination $_.Name) -Force
    }
  }
}

if (-not (Test-Path -LiteralPath $syncOpsScript)) {
  throw "Missing sync script: $syncOpsScript"
}

if (-not (Test-Path -LiteralPath $renderOpsHubScript)) {
  throw "Missing ops hub render script: $renderOpsHubScript"
}

& powershell -ExecutionPolicy Bypass -File $syncOpsScript -RepoRoot $RepoRoot | Out-Null
& powershell -ExecutionPolicy Bypass -File $renderOpsHubScript -RepoRoot $RepoRoot | Out-Null

Ensure-Dir -Path $TargetRoot
Ensure-Dir -Path $targetOpsDir
Ensure-Dir -Path $targetReportsDir
Ensure-Dir -Path $targetSiteDir
Ensure-Dir -Path $targetBrandDir

Copy-DirectoryContents -Source $opsDir -Destination $targetOpsDir -IncludePatterns @("*.md", "*.csv", "*.html")
Copy-DirectoryContents -Source $siteDir -Destination $targetSiteDir -IncludePatterns @("*.png")
Copy-DirectoryContents -Source $brandDir -Destination $targetBrandDir -IncludePatterns @("*.svg", "*.html")
Copy-DirectoryContents -Source $reportsDir -Destination $targetReportsDir -IncludePatterns @("*-latest.json")

$summary = [ordered]@{
  status = "ready"
  synced_at = (Get-Date).ToString("s")
  repo_root = $RepoRoot
  target_root = $TargetRoot
  copied = [ordered]@{
    ops = @(
      Get-ChildItem -LiteralPath $targetOpsDir -File | Sort-Object Name | Select-Object -ExpandProperty Name
    )
    reports = @(
      Get-ChildItem -LiteralPath $targetReportsDir -File | Sort-Object Name | Select-Object -ExpandProperty Name
    )
    site = @(
      Get-ChildItem -LiteralPath $targetSiteDir -File | Sort-Object Name | Select-Object -ExpandProperty Name
    )
    brand = @(
      Get-ChildItem -LiteralPath $targetBrandDir -File | Sort-Object Name | Select-Object -ExpandProperty Name
    )
  }
}

$summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $TargetRoot "sync-status.json") -Encoding UTF8
$summary | ConvertTo-Json -Depth 6

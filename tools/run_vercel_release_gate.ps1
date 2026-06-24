param(
  [ValidateSet('all', 'public', 'ytf')]
  [string]$Target = 'all',
  [switch]$DeployPublic,
  [switch]$DeployYtf,
  [switch]$SkipBuild,
  [switch]$SkipLive,
  [switch]$SkipRelink
)

$ErrorActionPreference = 'Stop'

function Invoke-Step {
  param(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments = @()
  )

  Write-Host "==> $Name" -ForegroundColor Cyan
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Step failed: $Name"
  }
}

function Test-CommandAvailable {
  param([string]$Name)
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Set-VercelProject {
  param([string]$Project)

  if ($SkipRelink) {
    Write-Host "Skipping Vercel relink for $Project."
    return
  }

  Invoke-Step "Link Vercel project: $Project" npx @('vercel', 'link', '--yes', '--project', $Project)
  Add-StepResult "Link Vercel project: $Project"
}

$root = (Get-Location).Path
$startedAt = (Get-Date).ToUniversalTime().ToString('o')
$results = [ordered]@{
  status = 'running'
  started_at = $startedAt
  root = $root
  target = $Target
  github_actions_required = $false
  vercel_required = $true
  notes = @(
    'GitHub is code storage only while GitHub Actions billing is locked.',
    'Vercel is the deploy and cron/runtime control plane.',
    'Codex/local release gates provide validation before deploy.'
  )
  steps = @()
}

function Add-StepResult {
  param([string]$Name)
  $script:results.steps += [ordered]@{
    name = $Name
    completed_at = (Get-Date).ToUniversalTime().ToString('o')
  }
}

if (-not (Test-CommandAvailable 'node')) {
  throw 'Node.js is required for this release gate.'
}

if (-not (Test-CommandAvailable 'npm')) {
  throw 'npm is required for this release gate.'
}

Invoke-Step 'Vercel CLI version' npx @('vercel', '--version')
Add-StepResult 'Vercel CLI version'

if (Test-CommandAvailable 'gh') {
  & gh auth status | Out-Host
  $results.github_cli_available = $true
} else {
  $results.github_cli_available = $false
}

if ($Target -in @('all', 'public')) {
  Set-VercelProject 'supermega-public'

  Invoke-Step 'Public Vercel config guard' npm @('run', 'vercel:guard')
  Add-StepResult 'Public Vercel config guard'

  if (-not $SkipBuild) {
    Invoke-Step 'Showroom lint' cmd @('/c', 'npm --prefix showroom run lint')
    Add-StepResult 'Showroom lint'

    Invoke-Step 'Showroom build' cmd @('/c', 'npm --prefix showroom run build')
    Add-StepResult 'Showroom build'
  }

  Invoke-Step 'Create public Vercel output' node @('tools/create_public_vercel_output.mjs')
  Add-StepResult 'Create public Vercel output'

  Invoke-Step 'Verify public Vercel output' node @('tools/verify_public_vercel_output.mjs')
  Add-StepResult 'Verify public Vercel output'

  if ($DeployPublic) {
    Invoke-Step 'Deploy public site to Vercel' powershell @('-ExecutionPolicy', 'Bypass', '-File', 'tools/deploy_public_to_project.ps1', '-AttachDomains')
    Add-StepResult 'Deploy public site to Vercel'
  }

  if (-not $SkipLive) {
    Invoke-Step 'Public domain health' uv @('run', '--no-sync', 'python', 'tools/check_supermega_domain.py', '--json-out', 'tmp/domain_health_vercel_gate.json')
    Add-StepResult 'Public domain health'
  }
}

if ($Target -in @('all', 'ytf')) {
  if ($DeployYtf) {
    Set-VercelProject 'supermega-ytf'
  }

  if ($DeployYtf) {
    Invoke-Step 'Deploy YTF to Vercel' powershell @('-ExecutionPolicy', 'Bypass', '-File', 'tools/deploy_ytf_vercel.ps1')
    Add-StepResult 'Deploy YTF to Vercel'
  }

  if (-not $SkipLive) {
    Invoke-Step 'YTF cloud autonomy' uv @('run', '--no-sync', 'python', 'tools/check_ytf_cloud_autonomy.py', '--base-url', 'https://ytf.supermega.dev', '--as-json')
    Add-StepResult 'YTF cloud autonomy'

    Invoke-Step 'YTF data pipeline smoke' uv @('run', '--no-sync', 'python', 'tools/smoke_test_ytf_data_pipeline.py', '--base-url', 'https://ytf.supermega.dev', '--as-json')
    Add-StepResult 'YTF data pipeline smoke'

    Invoke-Step 'YTF privacy smoke' node @('tools/verify_ytf_privacy.mjs', '--live')
    Add-StepResult 'YTF privacy smoke'
  }
}

$results.status = 'ready'
$results.completed_at = (Get-Date).ToUniversalTime().ToString('o')

$artifactDir = Join-Path $root 'artifacts/vercel-release-gate'
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
$latestPath = Join-Path $artifactDir 'latest.json'
$datedPath = Join-Path $artifactDir ("release-gate-{0}.json" -f ((Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')))
$json = $results | ConvertTo-Json -Depth 8
Set-Content -LiteralPath $latestPath -Value $json -Encoding UTF8
Set-Content -LiteralPath $datedPath -Value $json -Encoding UTF8

Write-Host 'Vercel release gate passed.' -ForegroundColor Green
Write-Host "Report: $latestPath"

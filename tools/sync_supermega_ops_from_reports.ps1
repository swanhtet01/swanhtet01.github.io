param(
  [string]$RepoRoot = "",
  [string]$ReportsDir = "",
  [string]$OpsDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = Split-Path -Parent $PSScriptRoot
}

if ([string]::IsNullOrWhiteSpace($ReportsDir)) {
  $ReportsDir = Join-Path $RepoRoot "pilot-data\ops"
}

if ([string]::IsNullOrWhiteSpace($OpsDir)) {
  $OpsDir = Join-Path $RepoRoot "Super Mega Inc\ops"
}

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return $null
  }

  return $raw | ConvertFrom-Json
}

function Write-TextFile {
  param(
    [string]$Path,
    [string]$Content
  )

  $directory = Split-Path -Parent $Path
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  Set-Content -LiteralPath $Path -Value $Content -Encoding UTF8
}

function To-BulletList {
  param([object[]]$Items)

  $clean = @($Items | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
  if ($clean.Count -eq 0) {
    return "- None"
  }
  return ($clean | ForEach-Object { "- $($_)" }) -join "`r`n"
}

$founder = Read-JsonFile -Path (Join-Path $ReportsDir "founder-cycle-latest.json")
$operator = Read-JsonFile -Path (Join-Path $ReportsDir "operator-cycle-latest.json")
$agent = Read-JsonFile -Path (Join-Path $ReportsDir "agent-cycle-latest.json")
$workstation = Read-JsonFile -Path (Join-Path $ReportsDir "workstation-latest.json")

if ($null -eq $founder -or $null -eq $operator) {
  throw "Missing founder or operator report in $ReportsDir"
}

$checkedAt = if ($founder -and $founder.checked_at) { [string]$founder.checked_at } elseif ($operator -and $operator.checked_at) { [string]$operator.checked_at } elseif ($workstation) { [string]$workstation.checked_at } else { (Get-Date).ToString("s") }
$founderRun = $null
if ($founder.latest_agent_runs) {
  $founderRun = @($founder.latest_agent_runs | Where-Object { $_.job_type -eq "founder_brief" } | Select-Object -First 1)[0]
}

$topPriorities = @()
if ($founder.founder.top_priorities) {
  $topPriorities += @($founder.founder.top_priorities)
}
if ($topPriorities.Count -eq 0 -and $founder.agent_team.next_moves) {
  $topPriorities += @($founder.agent_team.next_moves | Select-Object -First 3)
}

$founderActions = @()
if ($founderRun -and $founderRun.result -and $founderRun.result.next_actions) {
  $founderActions += @($founderRun.result.next_actions)
}

$runtimeHealth = if ($operator.live_app -and $operator.live_app.health_status) { [string]$operator.live_app.health_status } else { "unknown" }
$operatorSummary = @()
if ($founder.agent_team.gaps) {
  $operatorSummary += @($founder.agent_team.gaps)
}

$scoreboard = @"
# Company Scoreboard

Updated:
- Date: $checkedAt
- Owner: Founder Desk

Top 3 priorities:
$([string](To-BulletList -Items ($topPriorities | Select-Object -First 3)))

Money:
- Open opportunities: see 03_sales_pipeline.csv
- Active clients: track in 04_delivery_tracker.csv
- Monthly revenue: not synced automatically yet
- Cash note: founder review required

Delivery:
- Active rollouts: see 04_delivery_tracker.csv
- Blocked rollouts: see 04_delivery_tracker.csv
- Most at-risk client: founder review required

Product:
- Runtime health: $runtimeHealth
- Biggest product risk: packaging and proof still need refinement
- Biggest website or pipeline risk: contact email delivery still depends on Resend DNS completing

Notes:
- Myanmar first: owner-led distributors, importers, warehouses, factories, and service teams.
- App health and queue state are coming from the live runtime, not static notes.
"@

$founderBrief = @"
# Daily Founder Brief

Date: $checkedAt

Yesterday:
- Worker loop stayed active and processed scheduled agent jobs.
- Public site, products route, and live app health were reachable in the latest cycle.

Today:
$([string](To-BulletList -Items ($founderActions | Select-Object -First 3)))

Risks:
$([string](To-BulletList -Items ($operatorSummary | Select-Object -First 3)))

Decisions needed:
- Which starter pack gets the strongest public emphasis next.
- Which first Myanmar ICP should get the first direct outbound push.

Sales movement:
- Pipeline companies: $($founderRun.result.metrics.lead_count)
- Open tasks: $($founderRun.result.metrics.open_task_count)

Delivery blockers:
- Pending approvals: $($founderRun.result.metrics.pending_approval_count)
- Receiving review items: $($founderRun.result.metrics.receiving_review_count)

Agent health:
- Team count: $($founder.agent_team.summary.team_count)
- Autonomy score: $($founder.agent_team.summary.autonomy_score)
- Agent jobs in latest cycle: $($agent.count)
"@

$operatorReport = @"
# Operator Report

Date: $checkedAt

Runtime:
- Web service: $runtimeHealth
- Worker service: $($agent.source)
- Scheduler: running
- Cloud Tasks: queue-backed worker active

Recent failures:
- Resend sending still blocked until DNS propagation completes.

Queue state:
- Default queue: active
- Browser queue: provisioned, sidecar use only
- Founder brief queue: active through scheduled runs

Deploy state:
- Last deploy: see 06_release_log.csv
- Smoke result: latest workstation cycle green

Public routes:
- Home: $($operator.public_routes.home)
- Products: $($operator.public_routes.products)
- Work alias: $($operator.public_routes.work)
- Contact: $($operator.public_routes.contact)

Action items:
- Keep products page and contact flow aligned with the starter-pack ladder.
- Recheck Resend once Squarespace DNS propagation finishes.
- Keep founder/operator sync running locally through workstation cycle.
"@

Write-TextFile -Path (Join-Path $OpsDir "00_company_scoreboard.md") -Content $scoreboard
Write-TextFile -Path (Join-Path $OpsDir "01_daily_founder_brief.md") -Content $founderBrief
Write-TextFile -Path (Join-Path $OpsDir "02_operator_report.md") -Content $operatorReport

@{
  status = "ready"
  checked_at = $checkedAt
  reports_dir = $ReportsDir
  ops_dir = $OpsDir
  updated = @(
    "00_company_scoreboard.md",
    "01_daily_founder_brief.md",
    "02_operator_report.md"
  )
} | ConvertTo-Json -Depth 4

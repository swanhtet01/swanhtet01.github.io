param(
  [string]$RepoRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = Split-Path -Parent $PSScriptRoot
}

$opsDir = Join-Path $RepoRoot "Super Mega Inc\ops"
$reportsDir = Join-Path $RepoRoot "pilot-data\ops"
$outputPath = Join-Path $opsDir "index.html"
$mirrorRoot = "C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq"
$mirrorOpsDir = Join-Path $mirrorRoot "ops"
$mirrorReportsDir = Join-Path $mirrorRoot "reports"
$envFiles = @(
  (Join-Path $RepoRoot ".env.app.example"),
  (Join-Path $RepoRoot ".env.app.local")
)

function Read-EnvDefaults {
  param([string[]]$Paths)

  $values = @{}
  foreach ($path in $Paths) {
    if (-not (Test-Path -LiteralPath $path)) {
      continue
    }

    foreach ($line in Get-Content -LiteralPath $path -Encoding UTF8) {
      if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) {
        continue
      }

      if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
        $key = $matches[1]
        $value = $matches[2].Trim()
        if (
          ($value.StartsWith('"') -and $value.EndsWith('"')) -or
          ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
          $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$key] = $value
      }
    }
  }

  return $values
}

function Read-JsonFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Escape-Html {
  param([AllowNull()][string]$Value)
  if ($null -eq $Value) {
    return ""
  }
  return [System.Net.WebUtility]::HtmlEncode([string]$Value)
}

function Coalesce {
  param($Value, $Fallback)
  if ($null -eq $Value) {
    return $Fallback
  }
  if ($Value -is [string] -and [string]::IsNullOrWhiteSpace($Value)) {
    return $Fallback
  }
  return $Value
}

function Get-OptionalValue {
  param(
    $InputObject,
    [string[]]$Path,
    $Fallback = $null
  )

  $current = $InputObject
  foreach ($segment in $Path) {
    if ($null -eq $current) {
      return $Fallback
    }

    if ($current -is [System.Collections.IDictionary]) {
      if (-not $current.Contains($segment)) {
        return $Fallback
      }
      $current = $current[$segment]
      continue
    }

    $property = $current.PSObject.Properties[$segment]
    if ($null -eq $property) {
      return $Fallback
    }

    $current = $property.Value
  }

  return Coalesce -Value $current -Fallback $Fallback
}

function Ensure-Array {
  param($Value)

  if ($null -eq $Value) {
    return @()
  }

  return @($Value)
}

function Render-ListItems {
  param([object[]]$Values)
  if (-not $Values -or $Values.Count -eq 0) {
    return "<li>None</li>"
  }
  return (($Values | ForEach-Object { "<li>$(Escape-Html $_)</li>" }) -join "`n")
}

$workstation = Read-JsonFile -Path (Join-Path $reportsDir "workstation-latest.json")
$founder = Read-JsonFile -Path (Join-Path $reportsDir "founder-cycle-latest.json")
$operator = Read-JsonFile -Path (Join-Path $reportsDir "operator-cycle-latest.json")
$agent = Read-JsonFile -Path (Join-Path $reportsDir "agent-cycle-latest.json")
$envDefaults = Read-EnvDefaults -Paths $envFiles

$checkedAt = Escape-Html (Get-OptionalValue -InputObject $workstation -Path @("checked_at") -Fallback (Get-Date).ToString("s"))
$baseUrl = Escape-Html (Get-OptionalValue -InputObject $workstation -Path @("base_url") -Fallback "")
$publicUrl = Escape-Html (Get-OptionalValue -InputObject $workstation -Path @("public_url") -Fallback "")
$mirrorIndexPath = Escape-Html (Join-Path $mirrorOpsDir "index.html")
$runbookPath = Escape-Html (Join-Path $mirrorOpsDir "30_founder_local_access_runbook.md")
$scoreboardPath = Escape-Html (Join-Path $mirrorOpsDir "00_company_scoreboard.md")
$founderBriefPath = Escape-Html (Join-Path $mirrorOpsDir "01_daily_founder_brief.md")
$operatorReportPath = Escape-Html (Join-Path $mirrorOpsDir "02_operator_report.md")
$architecturePath = Escape-Html (Join-Path $mirrorOpsDir "27_supermega_platform_architecture.md")
$defaultsPath = Escape-Html (Join-Path $mirrorOpsDir "28_tenant_identity_and_defaults.md")
$reportsPath = Escape-Html (Join-Path $mirrorReportsDir "workstation-latest.json")
$openWorkspaceScript = Escape-Html (Join-Path $RepoRoot "tools\open_supermega_founder_workspace.ps1")
$authRequired = Escape-Html (Coalesce -Value $envDefaults["SUPERMEGA_AUTH_REQUIRED"] -Fallback "1")
$appUsername = Escape-Html (Coalesce -Value $envDefaults["SUPERMEGA_APP_USERNAME"] -Fallback "owner")
$appPassword = Escape-Html (Coalesce -Value $envDefaults["SUPERMEGA_APP_PASSWORD"] -Fallback "supermega-demo")
$appDisplayName = Escape-Html (Coalesce -Value $envDefaults["SUPERMEGA_APP_DISPLAY_NAME"] -Fallback "Owner")
$workspaceSlug = Escape-Html (Coalesce -Value $envDefaults["SUPERMEGA_WORKSPACE_SLUG"] -Fallback "supermega-lab")
$liveApp = Get-OptionalValue -InputObject $operator -Path @("live_app") -Fallback $null
$agentTeam = Get-OptionalValue -InputObject $founder -Path @("agent_team") -Fallback $null
$agentJobs = Ensure-Array (Get-OptionalValue -InputObject $agent -Path @("results") -Fallback @())
$teamNames = Ensure-Array (Get-OptionalValue -InputObject $agentTeam -Path @("team_names") -Fallback @())
$nextMoves = Ensure-Array (Get-OptionalValue -InputObject $agentTeam -Path @("next_moves") -Fallback @())
$gaps = Ensure-Array (Get-OptionalValue -InputObject $agentTeam -Path @("gaps") -Fallback @())
$autonomyScore = Escape-Html (Get-OptionalValue -InputObject $agentTeam -Path @("summary", "autonomy_score") -Fallback "0")
$teamCount = Escape-Html (Get-OptionalValue -InputObject $agentTeam -Path @("summary", "team_count") -Fallback "0")
$loopCount = Escape-Html (Get-OptionalValue -InputObject $agent -Path @("count") -Fallback "0")
$runtimeStatus = Escape-Html (Get-OptionalValue -InputObject $liveApp -Path @("health_status") -Fallback "unknown")
$pipelineLeadCount = Escape-Html (Get-OptionalValue -InputObject $liveApp -Path @("pipeline_lead_count") -Fallback "0")
$triageRun = $agentJobs | Where-Object {
  (Get-OptionalValue -InputObject $_ -Path @("job_type") -Fallback "") -eq 'task_triage'
} | Select-Object -First 1
$triageSummary = Escape-Html (Get-OptionalValue -InputObject $triageRun -Path @("summary") -Fallback "No triage summary yet")

$jobCards = if ($agentJobs.Count -gt 0) {
  ($agentJobs | ForEach-Object {
    @"
    <article class="card">
      <div class="meta-row">
        <span class="label">Loop</span>
        <span class="pill">$(Escape-Html (Get-OptionalValue -InputObject $_ -Path @("status") -Fallback "unknown"))</span>
      </div>
      <h3>$(Escape-Html (Get-OptionalValue -InputObject $_ -Path @("job_type") -Fallback "Unknown loop"))</h3>
      <p>$(Escape-Html (Get-OptionalValue -InputObject $_ -Path @("summary") -Fallback "No summary saved."))</p>
    </article>
"@
  }) -join "`n"
} else {
  '<article class="card"><h3>No agent runs yet</h3><p>The workstation has not saved agent output yet.</p></article>'
}

$html = @"
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SuperMega Ops Hub</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #06111d;
      --panel: #0c1827;
      --panel-strong: #0f2033;
      --line: rgba(148, 177, 209, 0.18);
      --text: #f4f8fc;
      --muted: #91a8c1;
      --accent: #27d2ff;
      --accent-alt: #ff8a2b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Inter, sans-serif;
      background:
        radial-gradient(circle at top right, rgba(39,210,255,0.10), transparent 24%),
        radial-gradient(circle at left top, rgba(255,138,43,0.08), transparent 20%),
        linear-gradient(180deg, #050b14 0%, var(--bg) 45%, #08121d 100%);
      color: var(--text);
    }
    .shell {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 32px 0 56px;
    }
    .hero, .panel, .card {
      border: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(12,24,39,0.96), rgba(8,17,29,0.92));
      border-radius: 22px;
      box-shadow: 0 28px 70px -44px rgba(0,0,0,0.78);
    }
    .hero {
      padding: 28px;
      display: grid;
      gap: 18px;
    }
    .grid {
      display: grid;
      gap: 18px;
    }
    .grid.metrics { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 18px; }
    .grid.cols { grid-template-columns: 1.1fr 0.9fr; margin-top: 18px; }
    .grid.cards { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 18px; }
    .panel { padding: 24px; }
    .card { padding: 18px; }
    .kicker {
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.22em;
      font-size: 11px;
      font-weight: 800;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: clamp(36px, 7vw, 68px); line-height: 0.96; max-width: 900px; }
    h2 { font-size: 28px; margin-top: 12px; }
    h3 { font-size: 18px; margin-top: 8px; }
    p { color: var(--muted); line-height: 1.6; }
    .hero-copy p { max-width: 760px; font-size: 16px; }
    .meta-row, .links {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    .pill, .link-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.04);
      color: var(--text);
      font-size: 12px;
      font-weight: 700;
      text-decoration: none;
    }
    .accent { color: var(--accent); }
    .warning { color: var(--accent-alt); }
    .metric-value {
      font-size: 34px;
      font-weight: 800;
      color: var(--text);
      margin-top: 10px;
    }
    ul { margin: 14px 0 0; padding-left: 18px; color: var(--muted); }
    li { margin: 7px 0; }
    .section-gap { margin-top: 18px; }
    a { color: var(--accent); }
    .mono { font-family: Consolas, monospace; font-size: 12px; color: var(--muted); }
    @media (max-width: 880px) {
      .grid.cols { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="hero-copy">
        <p class="kicker">SuperMega Ops Hub</p>
        <h1>One place to check whether the company is actually moving.</h1>
        <p class="section-gap">This file is regenerated from the live runtime and the local workstation cycle. Open it to see the current loops, priorities, team state, and where to inspect deeper.</p>
      </div>
      <div class="meta-row">
        <span class="pill">Updated $checkedAt</span>
        <span class="pill">Autonomy $autonomyScore</span>
        <span class="pill">Teams $teamCount</span>
        <span class="pill">Loops $loopCount</span>
      </div>
      <div class="links">
        <a class="link-chip" href="$(Escape-Html $publicUrl)" target="_blank" rel="noreferrer">Public site</a>
        <a class="link-chip" href="https://app.supermega.dev/app/teams" target="_blank" rel="noreferrer">Agent Ops</a>
        <a class="link-chip" href="https://app.supermega.dev/app/director" target="_blank" rel="noreferrer">Founder view</a>
        <a class="link-chip" href="https://app.supermega.dev/app/sales" target="_blank" rel="noreferrer">Sales view</a>
      </div>
    </section>

    <section class="grid metrics">
      <article class="panel">
        <p class="kicker">Runtime</p>
        <div class="metric-value">$runtimeStatus</div>
        <p>Stable runtime: <span class="mono">$baseUrl</span></p>
      </article>
      <article class="panel">
        <p class="kicker">Pipeline</p>
        <div class="metric-value">$pipelineLeadCount</div>
        <p>Companies currently in the working pipeline.</p>
      </article>
      <article class="panel">
        <p class="kicker">Open tasks</p>
        <div class="metric-value">$triageSummary</div>
        <p>Current triage summary from the queue worker.</p>
      </article>
      <article class="panel">
        <p class="kicker">Email</p>
        <div class="metric-value warning">Pending</div>
        <p>Resend still depends on <span class="mono">send.supermega.dev</span> DNS propagation.</p>
      </article>
    </section>

    <section class="grid cols">
      <article class="panel">
        <p class="kicker">Team map</p>
        <h2>Who is running the company</h2>
        <ul>
          $(Render-ListItems -Values $teamNames)
        </ul>
        <p class="section-gap">The live runtime is currently operator-led. The human layer sets direction. The worker layer keeps cleanup, triage, founder brief, and rollout follow-up running.</p>
      </article>
      <article class="panel">
        <p class="kicker">What needs attention</p>
        <h2>Next moves</h2>
        <ul>
          $(Render-ListItems -Values $nextMoves)
        </ul>
        <h3 class="section-gap">Current gaps</h3>
        <ul>
          $(Render-ListItems -Values $gaps)
        </ul>
      </article>
    </section>

    <section class="panel section-gap">
      <p class="kicker">Live agent loops</p>
      <h2>Current loop output</h2>
      <div class="grid cards">
        $jobCards
      </div>
    </section>

    <section class="grid cols section-gap">
      <article class="panel">
        <p class="kicker">Stable BDA mirror</p>
        <h2>Where updates and architecture land</h2>
        <ul>
          <li><span class="mono">$mirrorIndexPath</span> is the first screen in the stable mirror.</li>
          <li><span class="mono">$scoreboardPath</span> is the current company summary.</li>
          <li><span class="mono">$founderBriefPath</span> is the founder brief.</li>
          <li><span class="mono">$operatorReportPath</span> is the operator and runtime report.</li>
          <li><span class="mono">$architecturePath</span> and <span class="mono">$defaultsPath</span> hold the architecture and tenant defaults.</li>
          <li><span class="mono">$runbookPath</span> is the concise local access runbook.</li>
        </ul>
        <p class="section-gap">Latest workstation report: <span class="mono">$reportsPath</span></p>
        <p class="section-gap">Open locally by double-clicking <span class="mono">$mirrorIndexPath</span> or running <span class="mono">powershell -ExecutionPolicy Bypass -File $openWorkspaceScript</span>.</p>
      </article>
      <article class="panel">
        <p class="kicker">Current app defaults</p>
        <h2>What belongs in the app vs Codex</h2>
        <ul>
          <li>Current repo-side app default login: <span class="mono">$appUsername / $appPassword</span>.</li>
          <li>Auth required: <span class="mono">$authRequired</span>; display name: <span class="mono">$appDisplayName</span>; workspace: <span class="mono">$workspaceSlug</span>.</li>
          <li>Use <span class="mono">app.supermega.dev</span> for founder review, sales state, approvals, and Agent Ops.</li>
          <li>Use the stable mirror for reading synced updates and architecture outside the temp worktree.</li>
          <li>Use Codex for code changes, release work, infra changes, schema changes, and deep debugging.</li>
        </ul>
        <p class="section-gap">Live deployment can override the default login with environment variables. The mirror is for visibility, not credential authority.</p>
      </article>
    </section>
  </div>
</body>
</html>
"@

Set-Content -LiteralPath $outputPath -Value $html -Encoding UTF8

[ordered]@{
  status = "ready"
  output = $outputPath
  checked_at = (Get-Date).ToString("s")
} | ConvertTo-Json -Depth 4

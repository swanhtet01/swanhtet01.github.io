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

$checkedAt = Escape-Html (Coalesce $workstation.checked_at (Get-Date).ToString("s"))
$baseUrl = Escape-Html (Coalesce $workstation.base_url "")
$publicUrl = Escape-Html (Coalesce $workstation.public_url "")
$liveApp = $operator.live_app
$agentTeam = $founder.agent_team
$agentJobs = @($agent.results)
$teamNames = @($agentTeam.team_names)
$nextMoves = @($agentTeam.next_moves)
$gaps = @($agentTeam.gaps)

$jobCards = if ($agentJobs.Count -gt 0) {
  ($agentJobs | ForEach-Object {
    @"
    <article class="card">
      <div class="meta-row">
        <span class="label">Loop</span>
        <span class="pill">$(Escape-Html $_.status)</span>
      </div>
      <h3>$(Escape-Html $_.job_type)</h3>
      <p>$(Escape-Html $_.summary)</p>
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
        <span class="pill">Autonomy $(Escape-Html (Coalesce $agentTeam.summary.autonomy_score "0"))</span>
        <span class="pill">Teams $(Escape-Html (Coalesce $agentTeam.summary.team_count "0"))</span>
        <span class="pill">Loops $(Escape-Html (Coalesce $agent.count "0"))</span>
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
        <div class="metric-value">$(Escape-Html (Coalesce $liveApp.health_status "unknown"))</div>
        <p>Stable runtime: <span class="mono">$baseUrl</span></p>
      </article>
      <article class="panel">
        <p class="kicker">Pipeline</p>
        <div class="metric-value">$(Escape-Html (Coalesce $liveApp.pipeline_lead_count "0"))</div>
        <p>Companies currently in the working pipeline.</p>
      </article>
      <article class="panel">
        <p class="kicker">Open tasks</p>
        <div class="metric-value">$(Escape-Html ($agentJobs | Where-Object { $_.job_type -eq 'task_triage' } | Select-Object -ExpandProperty summary -First 1))</div>
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
        <p class="kicker">How to inspect</p>
        <h2>Where to look outside Codex</h2>
        <ul>
          <li><span class="mono">Super Mega Inc\ops\00_company_scoreboard.md</span> for the current company summary.</li>
          <li><span class="mono">Super Mega Inc\ops\01_daily_founder_brief.md</span> for founder-level priorities.</li>
          <li><span class="mono">Super Mega Inc\ops\02_operator_report.md</span> for runtime and ops state.</li>
          <li><span class="mono">pilot-data\ops\workstation-latest.json</span> for the latest local cycle result.</li>
          <li><span class="mono">app.supermega.dev/app/teams</span> for Agent Ops and manual loop runs.</li>
        </ul>
      </article>
      <article class="panel">
        <p class="kicker">Current company shape</p>
        <h2>SuperMega architecture</h2>
        <ul>
          <li>Public site for proof and contact.</li>
          <li>Shared app for sales, delivery, founder review, and agent ops.</li>
          <li>Cloud Scheduler plus Cloud Tasks for durable queued execution.</li>
          <li>Local workstation as mirror, report writer, and future browser sidecar.</li>
        </ul>
        <p class="section-gap">Architecture doc: <a href="15_agent_architecture.md">15_agent_architecture.md</a></p>
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

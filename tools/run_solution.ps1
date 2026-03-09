param(
    [string]$Config = "config.example.json",
    [switch]$SkipDrive,
    [switch]$SkipRun,
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$pilotWrapper = Join-Path $scriptDir "pilot.ps1"

if (-not (Test-Path -LiteralPath $pilotWrapper)) {
    Write-Error "Missing wrapper script: $pilotWrapper"
    exit 1
}

Push-Location $repoRoot
try {
    if (-not $SkipRun) {
        $args = @(
            "-ExecutionPolicy", "Bypass",
            "-File", $pilotWrapper,
            "autopilot-run",
            "--config", $Config
        )
        if ($SkipDrive) {
            $args += "--skip-drive"
        }

        Write-Host "Running personal solution pipeline..."
        powershell @args
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Pipeline failed with exit code $LASTEXITCODE"
            exit $LASTEXITCODE
        }
    }

    $dashboard = Join-Path $repoRoot "swan-intelligence-hub\index.html"
    $brief = Join-Path $repoRoot "pilot-data\pilot_solution.md"
    $dqms = Join-Path $repoRoot "pilot-data\dqms_weekly_summary.md"
    $autopilot = Join-Path $repoRoot "pilot-data\autopilot_status.md"

    Write-Host ""
    Write-Host "Your live solution outputs:"
    Write-Host ("- Dashboard: " + $dashboard)
    Write-Host ("- Director brief: " + $brief)
    Write-Host ("- DQMS weekly summary: " + $dqms)
    Write-Host ("- Pipeline status: " + $autopilot)

    if (-not $NoOpen) {
        if (Test-Path -LiteralPath $dashboard) {
            Start-Process $dashboard | Out-Null
        }
        if (Test-Path -LiteralPath $brief) {
            Start-Process $brief | Out-Null
        }
    }
}
finally {
    Pop-Location
}

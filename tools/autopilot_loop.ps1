param(
    [string]$Config = ".\config.example.json",
    [int]$IntervalMinutes = 60,
    [int]$MaxRuns = 0,
    [switch]$SkipDrive = $true,
    [switch]$RunDomainCheck = $false
)

$ErrorActionPreference = "Stop"
$python = "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe"
$repoRoot = Split-Path -Parent $PSScriptRoot
$historyDir = Join-Path $repoRoot "pilot-data"
$historyFile = Join-Path $historyDir "autopilot_history.jsonl"
$statusFile = Join-Path $historyDir "autopilot_status.json"

if (-not (Test-Path $python)) {
    throw "Python venv not found at $python"
}

New-Item -ItemType Directory -Force -Path $historyDir | Out-Null

$runCount = 0
while ($true) {
    if ($MaxRuns -gt 0 -and $runCount -ge $MaxRuns) {
        Write-Host "Reached MaxRuns=$MaxRuns. Exiting loop."
        break
    }

    $runCount += 1
    $started = Get-Date
    Write-Host "[$($started.ToString('s'))] Starting autopilot run #$runCount"

    $args = @(
        "-m", "mark1_pilot.cli",
        "autopilot-run",
        "--config", $Config
    )
    if ($SkipDrive) { $args += "--skip-drive" }
    if ($RunDomainCheck) { $args += "--run-domain-check" }

    & $python @args
    $exitCode = $LASTEXITCODE
    $finished = Get-Date

    $status = @{}
    if (Test-Path $statusFile) {
        try {
            $statusObj = Get-Content $statusFile -Raw | ConvertFrom-Json
            $status = @{
                status = $statusObj.status
                required_failure_count = $statusObj.required_failure_count
                optional_failure_count = $statusObj.optional_failure_count
            }
        }
        catch {
            $status = @{ status = "parse_error"; message = $_.Exception.Message }
        }
    }

    $entry = @{
        started_at = $started.ToString("o")
        finished_at = $finished.ToString("o")
        exit_code = $exitCode
        run_index = $runCount
        status = $status.status
        required_failure_count = $status.required_failure_count
        optional_failure_count = $status.optional_failure_count
    } | ConvertTo-Json -Compress
    Add-Content -Path $historyFile -Value $entry

    Write-Host "[$($finished.ToString('s'))] Completed run #$runCount exit=$exitCode status=$($status.status)"

    if ($IntervalMinutes -le 0) {
        break
    }
    Start-Sleep -Seconds ($IntervalMinutes * 60)
}

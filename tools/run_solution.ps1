param(
    [string]$Config = "config.example.json",
    [string]$Profile = "",
    [switch]$SkipDrive,
    [switch]$SkipDomainCheck,
    [switch]$SkipRun,
    [switch]$NoOpen,
    [switch]$Serve,
    [string]$BindHost = "0.0.0.0",
    [int]$Port = 8787,
    [switch]$ServeBackground
)

$ErrorActionPreference = "Stop"

function Get-PreferredPythonExecutable {
    param([string]$RepoRoot)

    $oneDriveRoot = Split-Path -Parent (Split-Path -Parent $RepoRoot)
    $candidates = @(
        (Join-Path $oneDriveRoot ".venv\Scripts\python.exe"),
        (Join-Path $RepoRoot ".venv\Scripts\python.exe"),
        (Join-Path $RepoRoot "venv\Scripts\python.exe"),
        (Join-Path $RepoRoot "venv\bin\python"),
        (Join-Path $RepoRoot ".venv-wsl\bin\python")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd -and $pythonCmd.Source -notmatch "WindowsApps\\python.exe$") {
        return $pythonCmd.Source
    }

    return ""
}

function Show-GmailReauthHint {
    param(
        [string]$RepoRoot,
        [string]$ConfigPath,
        [string]$PilotWrapper
    )

    $statusFile = Join-Path $RepoRoot "pilot-data\dqms_sync_status.json"
    if (-not (Test-Path -LiteralPath $statusFile)) {
        return
    }

    try {
        $statusPayload = Get-Content -Raw -LiteralPath $statusFile | ConvertFrom-Json
    }
    catch {
        return
    }

    $mailStatus = [string]$statusPayload.mail_status
    $mailWarning = [string]$statusPayload.mail_warning
    if (($mailStatus -eq "ready") -and [string]::IsNullOrWhiteSpace($mailWarning)) {
        return
    }

    Write-Host ""
    Write-Warning "Gmail signal coverage is currently reduced for the pilot pipeline."
    if (-not [string]::IsNullOrWhiteSpace($mailWarning)) {
        Write-Host ("Mail note: " + $mailWarning)
    }
    Write-Host "Fix it with this one command:"
    Write-Host ('powershell -ExecutionPolicy Bypass -File "{0}" gmail-auth --config "{1}" --host 127.0.0.1 --port 8765' -f $PilotWrapper, $ConfigPath)
    Write-Host "Then rerun run_solution to restore full email + DQMS signal coverage."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$pilotWrapper = Join-Path $scriptDir "pilot.ps1"
$configPath = $Config
if (-not [System.IO.Path]::IsPathRooted($configPath)) {
    $configPath = Join-Path $repoRoot $configPath
}
if (-not (Test-Path -LiteralPath $configPath)) {
    Write-Error ("Config file not found: " + $configPath)
    exit 1
}
$configPath = (Resolve-Path -LiteralPath $configPath).Path

if (-not (Test-Path -LiteralPath $pilotWrapper)) {
    Write-Error "Missing wrapper script: $pilotWrapper"
    exit 1
}

if (-not [string]::IsNullOrWhiteSpace($Profile)) {
    Set-Item -Path "Env:MARK1_PROFILE" -Value $Profile
    Write-Host ("Using MARK1_PROFILE -> " + $Profile)
}

Push-Location $repoRoot
try {
    if (-not $SkipRun) {
        $args = @(
            "-ExecutionPolicy", "Bypass",
            "-File", $pilotWrapper,
            "autopilot-run",
            "--config", $configPath
        )
        if ($SkipDrive) {
            $args += "--skip-drive"
        }
        if (-not $SkipDomainCheck) {
            $args += "--run-domain-check"
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
    $today = Join-Path $repoRoot "pilot-data\TODAY.md"
    $dqms = Join-Path $repoRoot "pilot-data\dqms_weekly_summary.md"
    $autopilot = Join-Path $repoRoot "pilot-data\autopilot_status.md"

    Write-Host ""
    Write-Host "Your live solution outputs:"
    Write-Host ("- Dashboard: " + $dashboard)
    Write-Host ("- Director brief: " + $brief)
    Write-Host ("- Today recap: " + $today)
    Write-Host ("- DQMS weekly summary: " + $dqms)
    Write-Host ("- Pipeline status: " + $autopilot)
    Show-GmailReauthHint -RepoRoot $repoRoot -ConfigPath $configPath -PilotWrapper $pilotWrapper

    if (-not $NoOpen) {
        if (Test-Path -LiteralPath $dashboard) {
            Start-Process $dashboard | Out-Null
        }
        if (Test-Path -LiteralPath $today) {
            Start-Process $today | Out-Null
        }
        if (Test-Path -LiteralPath $brief) {
            Start-Process $brief | Out-Null
        }
    }

    if ($Serve) {
        $pythonExe = Get-PreferredPythonExecutable -RepoRoot $repoRoot
        if (-not $pythonExe) {
            Write-Error "Cannot find Python executable for local server."
            exit 1
        }

        $serveScript = Join-Path $repoRoot "tools\serve_solution.py"
        if (-not (Test-Path -LiteralPath $serveScript)) {
            Write-Error "Missing server script: $serveScript"
            exit 1
        }

        Write-Host ""
        Write-Host ("Serving dashboard at http://{0}:{1}" -f $BindHost, $Port)
        if ($ServeBackground) {
            $siteRootPath = Join-Path $repoRoot "swan-intelligence-hub"
            $pilotDataPath = Join-Path $repoRoot "pilot-data"
            $logDir = Join-Path $repoRoot "pilot-data"
            if (-not (Test-Path -LiteralPath $logDir)) {
                New-Item -ItemType Directory -Path $logDir -Force | Out-Null
            }
            $stdoutLog = Join-Path $logDir "serve_solution.stdout.log"
            $stderrLog = Join-Path $logDir "serve_solution.stderr.log"
            $serveArgs = @(
                ('"{0}"' -f $serveScript),
                "--host", $BindHost,
                "--port", $Port,
                "--site-root", ('"{0}"' -f $siteRootPath),
                "--pilot-data", ('"{0}"' -f $pilotDataPath)
            )
            $serveProc = Start-Process -FilePath $pythonExe -PassThru -ArgumentList $serveArgs -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

            Start-Sleep -Seconds 1
            if ($serveProc.HasExited) {
                Write-Host ("Server process exited early. Stdout log: " + $stdoutLog)
                Write-Host ("Server process exited early. Stderr log: " + $stderrLog)
                if (Test-Path -LiteralPath $stderrLog) {
                    Get-Content -LiteralPath $stderrLog -Tail 40 | Out-Host
                }
                Write-Error ("Local server failed to start. Exit code: " + $serveProc.ExitCode)
                exit 1
            }
            Write-Host ("Server started in background (PID " + $serveProc.Id + ").")
            Write-Host ("Logs: " + $stdoutLog)
        }
        else {
            & $pythonExe $serveScript `
                --host $BindHost `
                --port $Port `
                --site-root (Join-Path $repoRoot "swan-intelligence-hub") `
                --pilot-data (Join-Path $repoRoot "pilot-data")
            if ($LASTEXITCODE -ne 0) {
                exit $LASTEXITCODE
            }
        }
    }
}
finally {
    Pop-Location
}

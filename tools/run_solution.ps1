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

function Get-AppSiteRoot {
    param([string]$RepoRoot)

    $candidates = @(
        (Join-Path $RepoRoot "showroom\dist"),
        (Join-Path $RepoRoot "swan-intelligence-hub")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
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
    Write-Host "Fix it with local-server auth (fast path):"
    Write-Host ('powershell -ExecutionPolicy Bypass -File "{0}" gmail-auth --config "{1}" --host 127.0.0.1 --port 8765' -f $PilotWrapper, $ConfigPath)
    Write-Host "If localhost callback fails, use manual auth fallback:"
    Write-Host ('powershell -ExecutionPolicy Bypass -File "{0}" gmail-auth-start --config "{1}"' -f $PilotWrapper, $ConfigPath)
    Write-Host ('powershell -ExecutionPolicy Bypass -File "{0}" gmail-auth-finish --config "{1}" --callback-url "<paste-full-callback-url>"' -f $PilotWrapper, $ConfigPath)
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

    $pythonExe = Get-PreferredPythonExecutable -RepoRoot $repoRoot
    if (-not $pythonExe) {
        Write-Error "Cannot find Python executable for local scripts."
        exit 1
    }

    $agentTeamsModule = "mark1_pilot.agent_teams"
    Write-Host "Refreshing agent team system..."
    & $pythonExe -m $agentTeamsModule --config $configPath --repo-root $repoRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Agent team system refresh failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }

    $stateSyncArgs = @(
        "-ExecutionPolicy", "Bypass",
        "-File", $pilotWrapper,
        "state-sync",
        "--config", $configPath
    )
    powershell @stateSyncArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Error "State sync failed after agent team refresh."
        exit $LASTEXITCODE
    }

    $siteRootPath = Get-AppSiteRoot -RepoRoot $repoRoot
    if (-not $siteRootPath) {
        Write-Warning "No built app shell found. Build the showroom first with: npm run build (in showroom)"
    }

    $dashboard = if ($siteRootPath) { Join-Path $siteRootPath "index.html" } else { Join-Path $repoRoot "showroom\dist\index.html" }
    $brief = Join-Path $repoRoot "pilot-data\pilot_solution.md"
    $today = Join-Path $repoRoot "pilot-data\TODAY.md"
    $dqms = Join-Path $repoRoot "pilot-data\dqms_weekly_summary.md"
    $autopilot = Join-Path $repoRoot "pilot-data\autopilot_status.md"
    $productLab = Join-Path $repoRoot "pilot-data\product_lab.md"
    $actionBoard = Join-Path $repoRoot "pilot-data\action_board.md"
    $agentTeams = Join-Path $repoRoot "pilot-data\agent_team_system.md"

    Write-Host ""
    Write-Host "Your live solution outputs:"
    Write-Host ("- Dashboard: " + $dashboard)
    Write-Host ("- Director brief: " + $brief)
    Write-Host ("- Today recap: " + $today)
    Write-Host ("- DQMS weekly summary: " + $dqms)
    Write-Host ("- Action board: " + $actionBoard)
    Write-Host ("- Agent team system: " + $agentTeams)
    Write-Host ("- Product lab: " + $productLab)
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
        if (Test-Path -LiteralPath $actionBoard) {
            Start-Process $actionBoard | Out-Null
        }
        if (Test-Path -LiteralPath $agentTeams) {
            Start-Process $agentTeams | Out-Null
        }
    }

    if ($Serve) {
        $serveScript = Join-Path $repoRoot "tools\serve_solution.py"
        if (-not (Test-Path -LiteralPath $serveScript)) {
            Write-Error "Missing server script: $serveScript"
            exit 1
        }

        Write-Host ""
        Write-Host ("Serving dashboard at http://{0}:{1}" -f $BindHost, $Port)
        if ($ServeBackground) {
            $siteRootPath = Get-AppSiteRoot -RepoRoot $repoRoot
            if (-not $siteRootPath) {
                Write-Error "No built app shell found. Run npm run build in the showroom directory first."
                exit 1
            }
            $pilotDataPath = Join-Path $repoRoot "pilot-data"
            $logDir = Join-Path $repoRoot "pilot-data"
            if (-not (Test-Path -LiteralPath $logDir)) {
                New-Item -ItemType Directory -Path $logDir -Force | Out-Null
            }
            $stdoutLog = Join-Path $logDir "serve_solution.stdout.log"
            $stderrLog = Join-Path $logDir "serve_solution.stderr.log"
            $serveArgs = @(
                "-u",
                ('"{0}"' -f $serveScript),
                "--host", $BindHost,
                "--port", $Port.ToString(),
                "--site-root", ('"{0}"' -f $siteRootPath),
                "--pilot-data", ('"{0}"' -f $pilotDataPath)
            )
            $serveProc = Start-Process -FilePath $pythonExe -WorkingDirectory $repoRoot -PassThru -ArgumentList $serveArgs -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

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
            $siteRootPath = Get-AppSiteRoot -RepoRoot $repoRoot
            if (-not $siteRootPath) {
                Write-Error "No built app shell found. Run npm run build in the showroom directory first."
                exit 1
            }
            & $pythonExe $serveScript `
                --host $BindHost `
                --port $Port `
                --site-root $siteRootPath `
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

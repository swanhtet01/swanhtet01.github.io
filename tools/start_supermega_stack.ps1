param(
    [string]$Config = ".\\config.example.json",
    [int]$Port = 8787,
    [string]$BindHost = "0.0.0.0",
    [int]$SupervisorIntervalMinutes = 60,
    [switch]$BuildShowroom,
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

function Wait-ForLocalUrl {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 45
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        }
        catch {
            Start-Sleep -Milliseconds 750
        }
    }

    return $false
}

function Stop-ExistingListener {
    param(
        [int]$PortToStop
    )

    $listeners = @(Get-NetTCPConnection -LocalPort $PortToStop -State Listen -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
        $processId = [int]$listener.OwningProcess
        if ($processId -gt 0) {
            try {
                $proc = Get-Process -Id $processId -ErrorAction Stop
                Write-Host ("Stopping existing process on port {0}: PID {1} ({2})" -f $PortToStop, $processId, $proc.ProcessName)
                Stop-Process -Id $processId -Force -ErrorAction Stop
            }
            catch {
                Write-Warning ("Could not stop PID {0} on port {1}: {2}" -f $processId, $PortToStop, $_.Exception.Message)
            }
        }
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$runSolution = Join-Path $scriptDir "run_solution.ps1"
$startSupervisor = Join-Path $scriptDir "start_supermega_supervisor.ps1"

Push-Location $repoRoot
try {
    if ($BuildShowroom) {
        Write-Host "Building showroom..."
        Push-Location (Join-Path $repoRoot "showroom")
        try {
            npm run build
            if ($LASTEXITCODE -ne 0) {
                throw "Showroom build failed."
            }
        }
        finally {
            Pop-Location
        }
    }

    Write-Host "Starting supervisor in background..."
    $supervisorArgs = @(
        "-ExecutionPolicy", "Bypass",
        "-File", $startSupervisor,
        "-Config", $Config,
        "-IntervalMinutes", $SupervisorIntervalMinutes,
        "-MaxCycles", 0
    )
    $supervisorProc = Start-Process powershell -PassThru -ArgumentList $supervisorArgs
    Write-Host ("Supervisor PID: " + $supervisorProc.Id)

    Write-Host "Starting app server..."
    Stop-ExistingListener -PortToStop $Port
    $serveArgs = @(
        "-ExecutionPolicy", "Bypass",
        "-File", $runSolution,
        "-Config", $Config,
        "-SkipRun",
        "-NoOpen",
        "-Serve",
        "-ServeBackground",
        "-BindHost", $BindHost,
        "-Port", $Port
    )
    powershell @serveArgs
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    $loginUrl = "http://localhost:{0}/login/" -f $Port
    $healthUrl = "http://localhost:{0}/api/health" -f $Port
    Write-Host ("Waiting for app server at " + $healthUrl)
    $serverReady = Wait-ForLocalUrl -Url $healthUrl
    if (-not $serverReady) {
        Write-Warning "App server did not become ready before timeout. Check pilot-data\\serve_solution.stderr.log"
        exit 1
    }

    Write-Host ("App server ready: " + $loginUrl)
    if (-not $NoOpen) {
        Start-Process $loginUrl | Out-Null
    }
}
finally {
    Pop-Location
}

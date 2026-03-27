param(
    [string]$Config = ".\\config.example.json",
    [int]$Port = 8787,
    [string]$BindHost = "0.0.0.0",
    [int]$SupervisorIntervalMinutes = 60,
    [switch]$BuildShowroom,
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

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
    $serveArgs = @(
        "-ExecutionPolicy", "Bypass",
        "-File", $runSolution,
        "-Config", $Config,
        "-SkipRun",
        "-NoOpen",
        "-Serve",
        "-BindHost", $BindHost,
        "-Port", $Port
    )

    if (-not $NoOpen) {
        Start-Sleep -Seconds 2
        Start-Process ("http://localhost:{0}/login/" -f $Port) | Out-Null
    }

    powershell @serveArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}

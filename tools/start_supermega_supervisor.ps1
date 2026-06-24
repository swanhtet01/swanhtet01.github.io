param(
    [string]$Config = ".\\config.example.json",
    [string]$BaseUrl = "http://127.0.0.1:8787",
    [int]$IntervalMinutes = 60,
    [int]$PollSeconds = 30,
    [int]$Limit = 12,
    [int]$MaxCycles = 0,
    [switch]$NoEnqueueDefaults
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

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$pythonExe = Get-PreferredPythonExecutable -RepoRoot $repoRoot
if (-not $pythonExe) {
    Write-Error "Cannot find Python executable for supervisor runtime."
    exit 1
}

$configPath = $Config
if (-not [System.IO.Path]::IsPathRooted($configPath)) {
    $configPath = Join-Path $repoRoot $configPath
}

$args = @(
    "-m", "mark1_pilot.supervisor",
    "--config", $configPath,
    "--repo-root", $repoRoot,
    "--base-url", $BaseUrl,
    "--interval-minutes", $IntervalMinutes,
    "--poll-seconds", $PollSeconds,
    "--limit", $Limit,
    "--max-cycles", $MaxCycles
)

if ($NoEnqueueDefaults) {
    $args += "--no-enqueue-defaults"
}

Push-Location $repoRoot
try {
    & $pythonExe @args
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}

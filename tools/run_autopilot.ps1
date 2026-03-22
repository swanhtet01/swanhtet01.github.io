param(
    [string]$Config = ".\config.example.json",
    [switch]$RebuildSearchIndex,
    [switch]$SkipDrive = $true,
    [switch]$RunDomainCheck = $true,
    [switch]$RunManusCatalog
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pilotWrapper = Join-Path $scriptDir "pilot.ps1"

if (-not (Test-Path -LiteralPath $pilotWrapper)) {
    throw "Missing wrapper script: $pilotWrapper"
}

$args = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $pilotWrapper,
    "autopilot-run",
    "--config", $Config
)

if ($RebuildSearchIndex) { $args += "--rebuild-search-index" }
if ($SkipDrive) { $args += "--skip-drive" }
if ($RunDomainCheck) { $args += "--run-domain-check" }
if ($RunManusCatalog) { $args += "--run-manus-catalog" }

powershell @args
exit $LASTEXITCODE

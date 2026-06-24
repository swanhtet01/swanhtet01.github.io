param(
    [string]$Config = "config.example.json",
    [string]$CallbackUrl
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pilotWrapper = Join-Path $scriptDir "pilot.ps1"
$powerShellCommand = Get-Command powershell.exe -ErrorAction SilentlyContinue
if (-not $powerShellCommand) {
    $powerShellCommand = Get-Command powershell -ErrorAction SilentlyContinue
}
if (-not $powerShellCommand) {
    $powerShellCommand = Get-Command pwsh -ErrorAction SilentlyContinue
}
if (-not $powerShellCommand) {
    Write-Error "Could not find powershell.exe, powershell, or pwsh for launching helper scripts."
    exit 1
}
$powerShellExe = $powerShellCommand.Source

if (-not (Test-Path -LiteralPath $pilotWrapper)) {
    Write-Error "Missing wrapper script: $pilotWrapper"
    exit 1
}

if ([string]::IsNullOrWhiteSpace($CallbackUrl) -or $CallbackUrl -eq "@clipboard" -or $CallbackUrl -eq "clipboard") {
    try {
        $CallbackUrl = Get-Clipboard
    }
    catch {
        $CallbackUrl = ""
    }
}

if ([string]::IsNullOrWhiteSpace($CallbackUrl)) {
    Write-Error "No callback URL provided and clipboard is empty."
    exit 1
}

if ($CallbackUrl -notmatch "^https?://" -and $CallbackUrl -notmatch "code=" -and $CallbackUrl.Length -lt 12) {
    Write-Error "Callback must be a full callback URL, a query string containing code=, or the raw OAuth code."
    exit 1
}

& $powerShellExe -ExecutionPolicy Bypass -File $pilotWrapper gmail-auth-finish --config $Config --callback-url $CallbackUrl
exit $LASTEXITCODE

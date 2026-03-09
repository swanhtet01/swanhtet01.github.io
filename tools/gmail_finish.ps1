param(
    [string]$Config = "config.example.json",
    [string]$CallbackUrl
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pilotWrapper = Join-Path $scriptDir "pilot.ps1"

if (-not (Test-Path -LiteralPath $pilotWrapper)) {
    Write-Error "Missing wrapper script: $pilotWrapper"
    exit 1
}

if ([string]::IsNullOrWhiteSpace($CallbackUrl)) {
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

if ($CallbackUrl -notmatch "^https?://") {
    Write-Error "Callback URL must start with http:// or https://"
    exit 1
}

powershell -ExecutionPolicy Bypass -File $pilotWrapper gmail-auth-finish --config $Config --callback-url $CallbackUrl
exit $LASTEXITCODE

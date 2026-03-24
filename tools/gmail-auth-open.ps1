param(
    [string]$Config = ".\config.example.json",
    [string]$AuthHost = "localhost",
    [int]$Port = 80,
    [switch]$Reset
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

Push-Location $repoRoot
try {
    if ($Reset) {
        .\tools\pilot.ps1 gmail-auth-reset --config $Config | Out-Null
    }
    .\tools\pilot.ps1 gmail-auth-start --config $Config --host $AuthHost --port $Port | Out-Null

    $authFile = Join-Path $repoRoot "pilot-data\gmail_auth_start.json"
    if (-not (Test-Path $authFile)) {
        throw "Auth session file was not created: $authFile"
    }

    $auth = Get-Content $authFile -Raw | ConvertFrom-Json
    if (-not $auth.authorization_url) {
        throw "Auth session file does not include an authorization URL."
    }

    Start-Process $auth.authorization_url | Out-Null

    Write-Host ""
    Write-Host "Opened Gmail sign-in in your browser." -ForegroundColor Green
    Write-Host "After login, copy the full localhost URL from the address bar." -ForegroundColor Yellow
    Write-Host "Blank localhost page is okay." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "If you need the link again:"
    Write-Host $auth.authorization_url
}
finally {
    Pop-Location
}

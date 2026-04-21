param(
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 0
)

$ErrorActionPreference = "Stop"

function Get-PreferredPythonExecutable {
    param([string]$RepoRoot)

    $oneDriveRoot = Split-Path -Parent (Split-Path -Parent $RepoRoot)
    $candidates = @(
        (Join-Path $RepoRoot ".venv\Scripts\python.exe"),
        (Join-Path $RepoRoot "venv\Scripts\python.exe"),
        (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"),
        (Join-Path $oneDriveRoot ".venv\Scripts\python.exe")
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd -and $pythonCmd.Source -notmatch "WindowsApps\\python.exe$") {
        return $pythonCmd.Source
    }

    $pyCmd = Get-Command py -ErrorAction SilentlyContinue
    if ($pyCmd) {
        return $pyCmd.Source
    }

    throw "Cannot resolve a Python runtime for SuperMega smoke."
}

function Get-FreeTcpPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try {
        return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    }
    finally {
        $listener.Stop()
    }
}

function Wait-ForLocalUrl {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        }
        catch {
            Start-Sleep -Seconds 1
        }
    }

    return $false
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$pythonExe = Get-PreferredPythonExecutable -RepoRoot $repoRoot
$serveScript = Join-Path $repoRoot "tools\serve_solution.py"
$appSmokeScript = Join-Path $repoRoot "tools\smoke_test_supermega_app.py"
$publicSmokeScript = Join-Path $repoRoot "tools\smoke_test_public_site.py"

if ($Port -le 0) {
    $Port = Get-FreeTcpPort
}

$baseUrl = "http://$BindHost`:$Port"
$runTag = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$workspaceSlug = if ($env:SUPERMEGA_SMOKE_WORKSPACE_SLUG) { $env:SUPERMEGA_SMOKE_WORKSPACE_SLUG } else { "portal-smoke-$runTag" }
$workspaceName = if ($env:SUPERMEGA_SMOKE_WORKSPACE_NAME) { $env:SUPERMEGA_SMOKE_WORKSPACE_NAME } else { "Portal Smoke Workspace $runTag" }
$appUsername = if ($env:SUPERMEGA_SMOKE_APP_USERNAME) { $env:SUPERMEGA_SMOKE_APP_USERNAME } else { "portal-owner-$runTag" }
$appPassword = if ($env:SUPERMEGA_SMOKE_APP_PASSWORD) { $env:SUPERMEGA_SMOKE_APP_PASSWORD } else { "supermega-demo" }
$appDisplayName = if ($env:SUPERMEGA_SMOKE_APP_DISPLAY_NAME) { $env:SUPERMEGA_SMOKE_APP_DISPLAY_NAME } else { "Portal Smoke Owner $runTag" }
$serverStdoutLog = Join-Path ([System.IO.Path]::GetTempPath()) "supermega-portal-server.stdout.log"
$serverStderrLog = Join-Path ([System.IO.Path]::GetTempPath()) "supermega-portal-server.stderr.log"

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

$env:SUPERMEGA_APP_USERNAME = $appUsername
$env:SUPERMEGA_APP_PASSWORD = $appPassword
$env:SUPERMEGA_APP_DISPLAY_NAME = $appDisplayName
$env:SUPERMEGA_WORKSPACE_SLUG = $workspaceSlug
$env:SUPERMEGA_WORKSPACE_NAME = $workspaceName

$serverProcess = Start-Process -FilePath $pythonExe -WorkingDirectory $repoRoot -PassThru -ArgumentList @(
    ('"{0}"' -f $serveScript),
    "--host", $BindHost,
    "--port", $Port.ToString()
) -RedirectStandardOutput $serverStdoutLog -RedirectStandardError $serverStderrLog

try {
    if (-not (Wait-ForLocalUrl -Url "$baseUrl/api/health" -TimeoutSeconds 60)) {
        Write-Host "Portal smoke server did not become ready at $baseUrl" -ForegroundColor Red
        if (Test-Path -LiteralPath $serverStderrLog) {
            Get-Content -LiteralPath $serverStderrLog -Tail 60 | Out-Host
        }
        elseif (Test-Path -LiteralPath $serverStdoutLog) {
            Get-Content -LiteralPath $serverStdoutLog -Tail 60 | Out-Host
        }
        exit 1
    }

    & $pythonExe $appSmokeScript `
        --base-url $baseUrl `
        --username $appUsername `
        --password $appPassword `
        --workspace $workspaceSlug `
        --timeout-seconds 60 `
        --as-json
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    & $pythonExe $publicSmokeScript --base-url $baseUrl
    exit $LASTEXITCODE
}
finally {
    if ($serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    }
}

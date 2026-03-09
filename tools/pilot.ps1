param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$CliArgs
)

$ErrorActionPreference = "Stop"

function Get-EnvValue {
    param([string]$Name)
    $item = Get-Item -Path ("Env:" + $Name) -ErrorAction SilentlyContinue
    if (-not $item) {
        return ""
    }
    return [string]$item.Value
}

function Set-EnvPathIfMissing {
    param(
        [string]$Name,
        [string[]]$Candidates
    )

    $current = Get-EnvValue -Name $Name
    if (-not [string]::IsNullOrWhiteSpace($current)) {
        return
    }

    foreach ($candidate in $Candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            continue
        }
        if (-not (Test-Path -LiteralPath $candidate)) {
            continue
        }
        $resolved = (Resolve-Path -LiteralPath $candidate).Path
        Set-Item -Path ("Env:" + $Name) -Value $resolved
        Write-Host ("Using " + $Name + " -> " + $resolved)
        return
    }
}

function Add-Attempt {
    param(
        [System.Collections.Generic.List[hashtable]]$List,
        [string]$Name,
        [string]$CommandPath,
        [string[]]$PrefixArgs
    )

    if (-not $CommandPath) {
        return
    }
    $List.Add(
        @{
            Name = $Name
            CommandPath = $CommandPath
            PrefixArgs = $PrefixArgs
        }
    )
}

function Invoke-CommandAttempt {
    param(
        [hashtable]$Attempt,
        [string]$RepoRoot,
        [string[]]$CliArgsToPass
    )

    Push-Location $RepoRoot
    try {
        & $Attempt.CommandPath @($Attempt.PrefixArgs + $CliArgsToPass) | Out-Host
        $exitCode = $LASTEXITCODE
        return [int]$exitCode
    }
    finally {
        Pop-Location
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$attempts = New-Object "System.Collections.Generic.List[hashtable]"
$secretsDir = Join-Path $repoRoot ".secrets"
$gmailSecretsDir = Join-Path $secretsDir "gmail"
$gcpSecretsDir = Join-Path $secretsDir "gcp"
$downloadsDir = Join-Path $HOME "Downloads"

if (-not (Test-Path -LiteralPath $gmailSecretsDir)) {
    New-Item -ItemType Directory -Path $gmailSecretsDir -Force | Out-Null
}
if (-not (Test-Path -LiteralPath $gcpSecretsDir)) {
    New-Item -ItemType Directory -Path $gcpSecretsDir -Force | Out-Null
}

$gmailTokenDefault = Join-Path $gmailSecretsDir "token.json"
if ([string]::IsNullOrWhiteSpace((Get-EnvValue -Name "GMAIL_OAUTH_TOKEN_JSON"))) {
    Set-Item -Path "Env:GMAIL_OAUTH_TOKEN_JSON" -Value $gmailTokenDefault
    Write-Host ("Using GMAIL_OAUTH_TOKEN_JSON -> " + $gmailTokenDefault)
}

$gmailClientCandidates = @(
    (Join-Path $gmailSecretsDir "client_secret.json"),
    (Join-Path $downloadsDir "client_secret_453184845544-5n5pbi2h1f0b0fm2gse87e2bbo3pse0f.apps.googleusercontent.com.json"),
    (Join-Path $downloadsDir "client_secret_453184845544-b9u6emogmhs1htshm82t7p5odvfvla7r.apps.googleusercontent.com.json")
)
$gmailClientMatches = Get-ChildItem -Path $downloadsDir -Filter "client_secret_*.json" -ErrorAction SilentlyContinue |
    Sort-Object -Property LastWriteTime -Descending |
    Select-Object -ExpandProperty FullName
if ($gmailClientMatches) {
    $gmailClientCandidates += $gmailClientMatches
}
Set-EnvPathIfMissing -Name "GMAIL_OAUTH_CLIENT_JSON" -Candidates $gmailClientCandidates

$gcpServiceCandidates = @(
    (Join-Path $gcpSecretsDir "service_account.json"),
    (Join-Path $downloadsDir "supermega-468612-9c08e1ed3bb4.json")
)
$gcpServiceMatches = Get-ChildItem -Path $downloadsDir -Filter "supermega-*.json" -ErrorAction SilentlyContinue |
    Sort-Object -Property LastWriteTime -Descending |
    Select-Object -ExpandProperty FullName
if ($gcpServiceMatches) {
    $gcpServiceCandidates += $gcpServiceMatches
}
Set-EnvPathIfMissing -Name "GOOGLE_SERVICE_ACCOUNT_JSON" -Candidates $gcpServiceCandidates

$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCmd -and $pythonCmd.Source -notmatch "WindowsApps\\python.exe$") {
    Add-Attempt -List $attempts -Name "python" -CommandPath $pythonCmd.Source -PrefixArgs @("-m", "mark1_pilot.cli")
}

$pyCmd = Get-Command py -ErrorAction SilentlyContinue
if ($pyCmd -and $pyCmd.Source -notmatch "WindowsApps\\py.exe$") {
    Add-Attempt -List $attempts -Name "py" -CommandPath $pyCmd.Source -PrefixArgs @("-3", "-m", "mark1_pilot.cli")
}

$venvWindowsPython = Join-Path $repoRoot "venv\Scripts\python.exe"
if (Test-Path $venvWindowsPython) {
    Add-Attempt -List $attempts -Name "venv-windows" -CommandPath $venvWindowsPython -PrefixArgs @("-m", "mark1_pilot.cli")
}

$wslCmd = Get-Command wsl -ErrorAction SilentlyContinue
if ($wslCmd) {
    $wslEnvArgs = @(
        ("GMAIL_OAUTH_CLIENT_JSON=" + (Get-EnvValue -Name "GMAIL_OAUTH_CLIENT_JSON")),
        ("GMAIL_OAUTH_TOKEN_JSON=" + (Get-EnvValue -Name "GMAIL_OAUTH_TOKEN_JSON")),
        ("GOOGLE_SERVICE_ACCOUNT_JSON=" + (Get-EnvValue -Name "GOOGLE_SERVICE_ACCOUNT_JSON"))
    )
    Add-Attempt -List $attempts -Name "wsl-python3" -CommandPath $wslCmd.Source -PrefixArgs (@("-e", "env") + $wslEnvArgs + @("python3", "-m", "mark1_pilot.cli"))
}

if ($attempts.Count -eq 0) {
    Write-Error "No Python interpreter found. Install Python or provide a venv with mark1_pilot dependencies."
    exit 1
}

$lastExitCode = 1
foreach ($attempt in $attempts) {
    Write-Host ("Trying interpreter: " + $attempt.Name)
    try {
        $lastExitCode = Invoke-CommandAttempt -Attempt $attempt -RepoRoot $repoRoot -CliArgsToPass $CliArgs
        if ($lastExitCode -ne 0) {
            Write-Warning ("Interpreter returned non-zero exit code: " + $attempt.Name + " -> " + $lastExitCode)
            continue
        }
        exit 0
    }
    catch {
        Write-Warning ("Interpreter attempt failed: " + $attempt.Name + " -> " + $_.Exception.Message)
    }
}

exit $lastExitCode

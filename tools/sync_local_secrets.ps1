param(
    [string]$SecretsFile = "C:\Users\swann\Documents\claude api.txt",
    [string]$RepoRoot = "",
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $RepoRoot ".env.app.local"
}

$showroomOutputPath = Join-Path $RepoRoot "showroom\.env.local"

function Read-KeyValueFile {
    param([string]$Path)

    $map = [ordered]@{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $map
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = [string]$line
        if ([string]::IsNullOrWhiteSpace($trimmed)) {
            continue
        }
        if ($trimmed.TrimStart().StartsWith("#")) {
            continue
        }
        $parts = $trimmed -split "=", 2
        if ($parts.Count -ne 2) {
            continue
        }
        $map[$parts[0].Trim()] = $parts[1].Trim()
    }

    return $map
}

function Merge-Defaults {
    param(
        [hashtable]$Target,
        [hashtable]$Defaults
    )

    foreach ($key in $Defaults.Keys) {
        if (-not $Target.Contains($key) -or [string]::IsNullOrWhiteSpace([string]$Target[$key])) {
            $Target[$key] = [string]$Defaults[$key]
        }
    }
}

function Find-FirstExistingPath {
    param([string[]]$Candidates)

    foreach ($candidate in $Candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            continue
        }
        if (Test-Path -LiteralPath $candidate) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    return ""
}

if (-not (Test-Path -LiteralPath $SecretsFile)) {
    Write-Warning ("Secret source file not found: " + $SecretsFile)
    exit 0
}

$raw = Get-Content -Raw -LiteralPath $SecretsFile

$anthropic = [regex]::Match($raw, '(?ms)^\s*claude api\s*$\s*([^\r\n]+)').Groups[1].Value.Trim()
$places = [regex]::Match($raw, '(?ms)^\s*google places api\s*$\s*([^\r\n]+)').Groups[1].Value.Trim()
$openai = [regex]::Match($raw, '(?ms)^\s*openai\s*$\s*supermega\s*$\s*([^\r\n]+)').Groups[1].Value.Trim()
$gmailClientId = [regex]::Match($raw, '(?ms)^\s*client id\s*$\s*([^\r\n]+)').Groups[1].Value.Trim()
$gmailClientSecret = [regex]::Match($raw, '(?ms)^\s*secret\s*$\s*(GOCSPX-[^\r\n]+)').Groups[1].Value.Trim()

$envMap = [ordered]@{}
$exampleMap = Read-KeyValueFile -Path (Join-Path $RepoRoot ".env.app.example")
$existingMap = Read-KeyValueFile -Path $OutputPath

Merge-Defaults -Target $envMap -Defaults $exampleMap
Merge-Defaults -Target $envMap -Defaults $existingMap

$envMap["SUPERMEGA_AUTH_REQUIRED"] = "1"
$envMap["SUPERMEGA_APP_USERNAME"] = "owner"
$envMap["SUPERMEGA_APP_PASSWORD"] = "supermega-demo"
$envMap["SUPERMEGA_APP_DISPLAY_NAME"] = "Owner"
$envMap["SUPERMEGA_APP_ROLE"] = "owner"
$envMap["SUPERMEGA_WORKSPACE_SLUG"] = "supermega-lab"
$envMap["SUPERMEGA_WORKSPACE_NAME"] = "SuperMega Lab"
$envMap["SUPERMEGA_WORKSPACE_PLAN"] = "pilot"
$envMap["SUPERMEGA_SESSION_HOURS"] = "336"
$envMap["SUPERMEGA_CORS_ORIGINS"] = "http://localhost:8787"
$envMap["SUPERMEGA_LLM_PROVIDER"] = "openai"
$envMap["SUPERMEGA_ANTHROPIC_MODEL"] = "claude-sonnet-4-20250514"
$envMap["SUPERMEGA_OPENAI_MODEL"] = "gpt-5-mini"

if (-not [string]::IsNullOrWhiteSpace($anthropic)) {
    $envMap["ANTHROPIC_API_KEY"] = $anthropic
}
if (-not [string]::IsNullOrWhiteSpace($places)) {
    $envMap["GOOGLE_PLACES_API_KEY"] = $places
    $envMap["GOOGLE_MAPS_API_KEY"] = $places
}
if (-not [string]::IsNullOrWhiteSpace($openai)) {
    $envMap["OPENAI_API_KEY"] = $openai
}
if (-not [string]::IsNullOrWhiteSpace($gmailClientId)) {
    $envMap["GMAIL_OAUTH_CLIENT_ID"] = $gmailClientId
}
if (-not [string]::IsNullOrWhiteSpace($gmailClientSecret)) {
    $envMap["GMAIL_OAUTH_CLIENT_SECRET"] = $gmailClientSecret
}

$serviceAccountPath = Find-FirstExistingPath -Candidates @(
    "C:\Users\swann\OneDrive - BDA\_tmp_keystore_20260328\keystore\supermega-468612-9c08e1ed3bb4.json",
    "C:\Users\swann\Downloads\supermega-468612-9c08e1ed3bb4.json"
)
if (-not [string]::IsNullOrWhiteSpace($serviceAccountPath)) {
    $envMap["GOOGLE_SERVICE_ACCOUNT_JSON"] = $serviceAccountPath
}

$gmailClientJsonPath = Find-FirstExistingPath -Candidates @(
    "C:\Users\swann\OneDrive - BDA\_tmp_keystore_20260328\keystore\client_secret_453184845544-5n5pbi2h1f0b0fm2gse87e2bbo3pse0f.apps.googleusercontent.com.json",
    "C:\Users\swann\OneDrive - BDA\_tmp_keystore_20260328\keystore\client_secret_453184845544-b9u6emogmhs1htshm82t7p5odvfvla7r.apps.googleusercontent.com.json",
    "C:\Users\swann\Downloads\client_secret_453184845544-5n5pbi2h1f0b0fm2gse87e2bbo3pse0f.apps.googleusercontent.com.json",
    "C:\Users\swann\Downloads\client_secret_453184845544-b9u6emogmhs1htshm82t7p5odvfvla7r.apps.googleusercontent.com.json"
)
if (-not [string]::IsNullOrWhiteSpace($gmailClientJsonPath)) {
    $envMap["GMAIL_OAUTH_CLIENT_JSON"] = $gmailClientJsonPath
}

$lines = New-Object System.Collections.Generic.List[string]
foreach ($key in $envMap.Keys) {
    $lines.Add(($key + "=" + [string]$envMap[$key]))
}

Set-Content -LiteralPath $OutputPath -Value $lines -Encoding UTF8
Write-Host ("Synced local app secrets -> " + $OutputPath)

$showroomMap = [ordered]@{}
$existingShowroomMap = Read-KeyValueFile -Path $showroomOutputPath
Merge-Defaults -Target $showroomMap -Defaults $existingShowroomMap

if (-not [string]::IsNullOrWhiteSpace([string]$envMap["GOOGLE_MAPS_API_KEY"])) {
    $showroomMap["VITE_GOOGLE_MAPS_API_KEY"] = [string]$envMap["GOOGLE_MAPS_API_KEY"]
}
if (-not [string]::IsNullOrWhiteSpace([string]$envMap["VITE_BOOKING_URL"])) {
    $showroomMap["VITE_BOOKING_URL"] = [string]$envMap["VITE_BOOKING_URL"]
}
if (-not [string]::IsNullOrWhiteSpace([string]$envMap["VITE_WORKSPACE_APP_BASE"])) {
    $showroomMap["VITE_WORKSPACE_APP_BASE"] = [string]$envMap["VITE_WORKSPACE_APP_BASE"]
}
if (-not [string]::IsNullOrWhiteSpace([string]$envMap["VITE_WORKSPACE_API_BASE"])) {
    $showroomMap["VITE_WORKSPACE_API_BASE"] = [string]$envMap["VITE_WORKSPACE_API_BASE"]
}

$showroomLines = New-Object System.Collections.Generic.List[string]
foreach ($key in $showroomMap.Keys) {
    $showroomLines.Add(($key + "=" + [string]$showroomMap[$key]))
}

Set-Content -LiteralPath $showroomOutputPath -Value $showroomLines -Encoding UTF8
Write-Host ("Synced showroom secrets -> " + $showroomOutputPath)

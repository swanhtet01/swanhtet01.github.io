param(
    [string]$SecretsFile = "",
    [string]$RepoRoot = "",
    [string]$OutputPath = "",
    [string]$ShowroomOutputPath = "",
    [string]$ServiceAccountJson = "",
    [string]$GmailClientJson = "",
    [switch]$AllowLocalSecretWrite,
    [string]$OwnerConfirmation = ""
)

$ErrorActionPreference = "Stop"
$ExpectedOwnerConfirmation = "I APPROVE SUPERMEGA LOCAL SECRET MATERIALIZATION"
$CloudAiProviderKeys = @(
    "AI_GATEWAY_API_KEY",
    "ANTHROPIC_API_KEY",
    "CLAUDE_API_KEY",
    "OPENAI_API_KEY",
    "OPENROUTER_API_KEY",
    "SUPERMEGA_ANTHROPIC_MODEL",
    "SUPERMEGA_OPENAI_MODEL",
    "SUPERMEGA_OR_MODEL_BULK",
    "SUPERMEGA_OR_MODEL_REASON",
    "SUPERMEGA_OR_MODEL_DEEP"
)

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}

if (-not $AllowLocalSecretWrite -or $OwnerConfirmation -cne $ExpectedOwnerConfirmation) {
    throw "Quarantined legacy local secret materializer. Re-run only with -AllowLocalSecretWrite and -OwnerConfirmation `"$ExpectedOwnerConfirmation`" after explicit owner approval."
}

if ([string]::IsNullOrWhiteSpace($SecretsFile)) {
    throw "Provide -SecretsFile explicitly. Legacy default secret-source paths are quarantined."
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    throw "Provide -OutputPath explicitly. Default app env-file writes are quarantined."
}

if ([string]::IsNullOrWhiteSpace($ShowroomOutputPath)) {
    throw "Provide -ShowroomOutputPath explicitly. Default showroom env-file writes are quarantined."
}

$showroomOutputPath = $ShowroomOutputPath

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

function Remove-CloudAiProviderMaterial {
    param([hashtable]$Target)

    foreach ($key in $CloudAiProviderKeys) {
        if ($Target.Contains($key)) {
            [void]$Target.Remove($key)
        }
    }
}

if (-not (Test-Path -LiteralPath $SecretsFile)) {
    Write-Warning ("Secret source file not found: " + $SecretsFile)
    exit 0
}

$raw = Get-Content -Raw -LiteralPath $SecretsFile

$places = [regex]::Match($raw, '(?ms)^\s*google places api\s*$\s*([^\r\n]+)').Groups[1].Value.Trim()
$gmailClientId = [regex]::Match($raw, '(?ms)^\s*client id\s*$\s*([^\r\n]+)').Groups[1].Value.Trim()
$gmailClientSecret = [regex]::Match($raw, '(?ms)^\s*secret\s*$\s*(GOCSPX-[^\r\n]+)').Groups[1].Value.Trim()

$envMap = [ordered]@{}
$exampleMap = Read-KeyValueFile -Path (Join-Path $RepoRoot ".env.app.example")
$existingMap = Read-KeyValueFile -Path $OutputPath

Merge-Defaults -Target $envMap -Defaults $exampleMap
Merge-Defaults -Target $envMap -Defaults $existingMap
Remove-CloudAiProviderMaterial -Target $envMap

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
$envMap["SUPERMEGA_LLM_PROVIDER"] = "ollama"
$envMap["SUPERMEGA_OLLAMA_ENABLED"] = "1"
$envMap["SUPERMEGA_OLLAMA_MODEL"] = "llama3.2:1b"
$envMap["OLLAMA_KEEP_ALIVE"] = "0s"

if (-not [string]::IsNullOrWhiteSpace($places)) {
    $envMap["GOOGLE_PLACES_API_KEY"] = $places
    $envMap["GOOGLE_MAPS_API_KEY"] = $places
}
if (-not [string]::IsNullOrWhiteSpace($gmailClientId)) {
    $envMap["GMAIL_OAUTH_CLIENT_ID"] = $gmailClientId
}
if (-not [string]::IsNullOrWhiteSpace($gmailClientSecret)) {
    $envMap["GMAIL_OAUTH_CLIENT_SECRET"] = $gmailClientSecret
}

$serviceAccountPath = Find-FirstExistingPath -Candidates @($ServiceAccountJson)
if (-not [string]::IsNullOrWhiteSpace($serviceAccountPath)) {
    $envMap["GOOGLE_SERVICE_ACCOUNT_JSON"] = $serviceAccountPath
}

$gmailClientJsonPath = Find-FirstExistingPath -Candidates @($GmailClientJson)
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

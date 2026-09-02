param(
    [string]$Repo = "swanhtet01/swanhtet01.github.io",
    [string]$ProjectId = "supermega-468612",
    [string]$Region = "asia-southeast1",
    [string]$Service = "supermega-app",
    [string]$PublicDomain = "https://supermega.dev",
    [string]$CustomAppDomain = "https://app.supermega.dev",
    [string]$EnvFile = "",
    [string]$ServiceAccountJson = "",
    [switch]$UseLiveRunUrl,
    [switch]$DeployApp,
    [switch]$DeployWebsite,
    [switch]$AllowExternalWrites,
    [string]$OwnerConfirmation = ""
)

$ErrorActionPreference = "Stop"
$ExpectedOwnerConfirmation = "I APPROVE SUPERMEGA GITHUB SECRET AND WORKFLOW WRITES"
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

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

function Get-GitHubToken {
    if (-not [string]::IsNullOrWhiteSpace($env:GH_TOKEN)) {
        return $env:GH_TOKEN
    }
    throw "GH_TOKEN must be set explicitly. Refusing to infer a token from git remote URLs."
}

function Load-EnvMap {
    param([string]$PathValue)
    $result = @{}
    Get-Content -LiteralPath $PathValue | ForEach-Object {
        $line = [string]$_
        if (-not $line -or $line.TrimStart().StartsWith("#")) {
            return
        }
        if ($line -match '^[A-Za-z0-9_]+=') {
            $parts = $line.Split("=", 2)
            $result[$parts[0]] = $parts[1]
        }
    }
    return $result
}

function Resolve-EnvFilePath {
    param([string]$Provided)
    if ([string]::IsNullOrWhiteSpace($Provided)) {
        throw "Provide -EnvFile explicitly. Legacy default env-file discovery is quarantined."
    }
    if (-not (Test-Path -LiteralPath $Provided)) {
        throw "Env file not found: $Provided"
    }
    return (Resolve-Path -LiteralPath $Provided).Path
}

function Assert-NoCloudAiProviderSecrets {
    param([hashtable]$EnvMap)

    foreach ($key in $CloudAiProviderKeys) {
        if ($EnvMap.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace([string]$EnvMap[$key])) {
            throw "Hosted AI provider secret key is quarantined for this SuperMega release lane: $key. Use local Ollama only."
        }
    }
}

function Assert-ExternalWriteApproval {
    if (-not $AllowExternalWrites -or $OwnerConfirmation -cne $ExpectedOwnerConfirmation) {
        throw "Quarantined legacy provider-write script. Re-run only with -AllowExternalWrites and -OwnerConfirmation `"$ExpectedOwnerConfirmation`" after explicit owner approval."
    }
    if ([string]::IsNullOrWhiteSpace($ServiceAccountJson)) {
        throw "Provide -ServiceAccountJson explicitly. Legacy service-account default paths are quarantined."
    }
    if (-not (Test-Path -LiteralPath $ServiceAccountJson)) {
        throw "Service account JSON not found: $ServiceAccountJson"
    }
}

function Set-GitHubSecret {
    param(
        [string]$RepoName,
        [string]$Name,
        [string]$Value
    )
    if ([string]::IsNullOrWhiteSpace($Value)) {
        return
    }
    gh secret set $Name --repo $RepoName --body $Value | Out-Null
}

function Set-GitHubSecretFromFile {
    param(
        [string]$RepoName,
        [string]$Name,
        [string]$PathValue
    )
    if (-not (Test-Path -LiteralPath $PathValue)) {
        return
    }
    Get-Content -Raw -LiteralPath $PathValue | gh secret set $Name --repo $RepoName | Out-Null
}

function Set-GitHubVariableValue {
    param(
        [string]$RepoName,
        [string]$Name,
        [string]$Value
    )
    gh variable set $Name --repo $RepoName --body $Value | Out-Null
}

Assert-ExternalWriteApproval
Require-Command -Name "gh"
Require-Command -Name "gcloud"
Require-Command -Name "git"

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    $env:GH_TOKEN = Get-GitHubToken
    $resolvedEnvFile = Resolve-EnvFilePath -Provided $EnvFile
    $envMap = Load-EnvMap -PathValue $resolvedEnvFile
    Assert-NoCloudAiProviderSecrets -EnvMap $envMap

    $dbUrl = (gcloud secrets versions access latest --secret=supermega-database-url --project $ProjectId).Trim()
    $liveServiceUrl = ""
    try {
        $liveServiceUrl = (gcloud run services describe $Service --project $ProjectId --region $Region --format='value(status.url)').Trim()
    }
    catch {
        $liveServiceUrl = ""
    }

    $appBase = if ($UseLiveRunUrl -and -not [string]::IsNullOrWhiteSpace($liveServiceUrl)) { $liveServiceUrl } else { $CustomAppDomain }
    $corsOrigins = @($PublicDomain, $appBase, $CustomAppDomain) |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Select-Object -Unique

    Set-GitHubSecretFromFile -RepoName $Repo -Name "GCP_SA_KEY" -PathValue $ServiceAccountJson
    Set-GitHubSecret -RepoName $Repo -Name "SUPERMEGA_APP_USERNAME" -Value ([string]$envMap["SUPERMEGA_APP_USERNAME"])
    Set-GitHubSecret -RepoName $Repo -Name "SUPERMEGA_APP_PASSWORD" -Value ([string]$envMap["SUPERMEGA_APP_PASSWORD"])
    Set-GitHubSecret -RepoName $Repo -Name "SUPERMEGA_DATABASE_URL" -Value $dbUrl
    Set-GitHubSecret -RepoName $Repo -Name "VITE_GOOGLE_MAPS_API_KEY" -Value ([string]$envMap["GOOGLE_MAPS_API_KEY"])

    if ($envMap.ContainsKey("RESEND_API_KEY")) {
        Set-GitHubSecret -RepoName $Repo -Name "RESEND_API_KEY" -Value ([string]$envMap["RESEND_API_KEY"])
    }
    if ($envMap.ContainsKey("STRIPE_SECRET_KEY")) {
        Set-GitHubSecret -RepoName $Repo -Name "STRIPE_SECRET_KEY" -Value ([string]$envMap["STRIPE_SECRET_KEY"])
    }
    if ($envMap.ContainsKey("STRIPE_WEBHOOK_SECRET")) {
        Set-GitHubSecret -RepoName $Repo -Name "STRIPE_WEBHOOK_SECRET" -Value ([string]$envMap["STRIPE_WEBHOOK_SECRET"])
    }
    if ($envMap.ContainsKey("VITE_POSTHOG_KEY")) {
        Set-GitHubSecret -RepoName $Repo -Name "VITE_POSTHOG_KEY" -Value ([string]$envMap["VITE_POSTHOG_KEY"])
    }
    if ($envMap.ContainsKey("SENTRY_DSN")) {
        Set-GitHubSecret -RepoName $Repo -Name "SENTRY_DSN" -Value ([string]$envMap["SENTRY_DSN"])
    }

    Set-GitHubVariableValue -RepoName $Repo -Name "VITE_WORKSPACE_APP_BASE" -Value $appBase
    Set-GitHubVariableValue -RepoName $Repo -Name "VITE_WORKSPACE_API_BASE" -Value $appBase
    Set-GitHubVariableValue -RepoName $Repo -Name "SUPERMEGA_APP_DISPLAY_NAME" -Value "SuperMega"
    Set-GitHubVariableValue -RepoName $Repo -Name "SUPERMEGA_APP_ROLE" -Value "owner"
    Set-GitHubVariableValue -RepoName $Repo -Name "SUPERMEGA_WORKSPACE_SLUG" -Value "supermega-lab"
    Set-GitHubVariableValue -RepoName $Repo -Name "SUPERMEGA_WORKSPACE_NAME" -Value "SuperMega Lab"
    Set-GitHubVariableValue -RepoName $Repo -Name "SUPERMEGA_WORKSPACE_PLAN" -Value "pilot"
    Set-GitHubVariableValue -RepoName $Repo -Name "SUPERMEGA_SESSION_HOURS" -Value "336"
    Set-GitHubVariableValue -RepoName $Repo -Name "SUPERMEGA_CLOUDSQL_INSTANCE" -Value "$ProjectId`:$Region`:supermega-app-db"
    Set-GitHubVariableValue -RepoName $Repo -Name "SUPERMEGA_CLOUD_TASKS_LOCATION" -Value $Region
    Set-GitHubVariableValue -RepoName $Repo -Name "SUPERMEGA_CLOUD_TASKS_QUEUE_DEFAULT" -Value "supermega-agent-default"
    Set-GitHubVariableValue -RepoName $Repo -Name "SUPERMEGA_CLOUD_TASKS_QUEUE_BROWSER" -Value "supermega-agent-browser"
    Set-GitHubVariableValue -RepoName $Repo -Name "SUPERMEGA_CLOUD_TASKS_QUEUE_BRIEF" -Value "supermega-founder-brief"
    Set-GitHubVariableValue -RepoName $Repo -Name "SUPERMEGA_CLOUD_TASKS_WORKER_URL" -Value ($appBase.TrimEnd("/") + "/api/internal/agent-runs/process-queue")
    Set-GitHubVariableValue -RepoName $Repo -Name "SUPERMEGA_CORS_ORIGINS" -Value (($corsOrigins -join ","))
    Set-GitHubVariableValue -RepoName $Repo -Name "VITE_POSTHOG_HOST" -Value "https://us.i.posthog.com"
    Set-GitHubVariableValue -RepoName $Repo -Name "SUPERMEGA_RESEND_FROM" -Value ($(if ($envMap.ContainsKey("SUPERMEGA_RESEND_FROM")) { [string]$envMap["SUPERMEGA_RESEND_FROM"] } else { "hello@supermega.dev" }))
    Set-GitHubVariableValue -RepoName $Repo -Name "SUPERMEGA_CONTACT_NOTIFY_EMAIL" -Value ($(if ($envMap.ContainsKey("SUPERMEGA_CONTACT_NOTIFY_EMAIL")) { [string]$envMap["SUPERMEGA_CONTACT_NOTIFY_EMAIL"] } else { "hello@supermega.dev" }))

    if ($envMap.ContainsKey("VITE_BOOKING_URL")) {
        Set-GitHubVariableValue -RepoName $Repo -Name "VITE_BOOKING_URL" -Value ([string]$envMap["VITE_BOOKING_URL"])
    }
    if ($envMap.ContainsKey("SUPERMEGA_SENTRY_TRACES")) {
        Set-GitHubVariableValue -RepoName $Repo -Name "SUPERMEGA_SENTRY_TRACES" -Value ([string]$envMap["SUPERMEGA_SENTRY_TRACES"])
    }
    if ($envMap.ContainsKey("VITE_SENTRY_DSN")) {
        Set-GitHubVariableValue -RepoName $Repo -Name "VITE_SENTRY_DSN" -Value ([string]$envMap["VITE_SENTRY_DSN"])
    }

    $appWorkflowUrl = ""
    $websiteWorkflowUrl = ""
    if ($DeployApp) {
        $appWorkflowUrl = (gh workflow run '.github/workflows/supermega-app-cloud-run.yml' --repo $Repo -f project_id=$ProjectId -f region=$Region -f service=$Service).Trim()
    }
    if ($DeployWebsite) {
        $websiteWorkflowUrl = (gh workflow run '.github/workflows/supermega-public-release.yml' --repo $Repo --ref main).Trim()
    }

    @{
        status = "ready"
        repo = $Repo
        env_file = $resolvedEnvFile
        service = $Service
        project_id = $ProjectId
        region = $Region
        app_base = $appBase
        live_service_url = $liveServiceUrl
        public_domain = $PublicDomain
        custom_app_domain = $CustomAppDomain
        deploy_app_workflow = $appWorkflowUrl
        deploy_website_workflow = $websiteWorkflowUrl
    } | ConvertTo-Json -Depth 5
}
finally {
    Pop-Location
}

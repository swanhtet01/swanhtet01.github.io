param(
    [string]$ProjectId = "supermega-468612",
    [string]$Region = "asia-southeast1",
    [string]$ArtifactRepository = "supermega-containers",
    [string]$Service = "supermega-app",
    [string]$SqlInstance = "supermega-app-db",
    [string]$SqlDatabase = "supermega",
    [string]$SqlUser = "supermega_app",
    [string]$AppDomain = "app.supermega.dev",
    [string]$PublicDomain = "supermega.dev",
    [string]$ServiceAccountKey = "C:\Users\swann\OneDrive - BDA\.credentials\service-account.json",
    [string]$GoogleOAuthClient = "C:\Users\swann\OneDrive - BDA\.credentials\google-oauth-client.json",
    [string]$EnvFile = "",
    [string]$GcloudAccount = "",
    [string]$BookingUrl = "",
    [switch]$SkipSql,
    [switch]$SkipBuild,
    [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

function Run-GcloudCapture {
    param([string[]]$CommandArgs)
    $effectiveArgs = @($CommandArgs)
    if ($GcloudAccount -and ($effectiveArgs.Count -lt 2 -or $effectiveArgs[0] -ne "auth")) {
        $effectiveArgs += "--account=$GcloudAccount"
    }
    $gcloudSource = (Get-Command gcloud -ErrorAction Stop).Source
    $gcloudCmd = Join-Path (Split-Path -Parent $gcloudSource) "gcloud.cmd"
    if (-not (Test-Path $gcloudCmd)) {
        $gcloudCmd = $gcloudSource
    }
    $stdoutPath = Join-Path $env:TEMP ("gcloud-stdout-{0}.log" -f ([guid]::NewGuid().ToString("N")))
    $stderrPath = Join-Path $env:TEMP ("gcloud-stderr-{0}.log" -f ([guid]::NewGuid().ToString("N")))
    try {
        $process = Start-Process -FilePath $gcloudCmd -ArgumentList $effectiveArgs -NoNewWindow -PassThru -Wait -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
        $stdout = if (Test-Path $stdoutPath) { Get-Content -LiteralPath $stdoutPath -ErrorAction SilentlyContinue } else { @() }
        $stderr = if (Test-Path $stderrPath) { Get-Content -LiteralPath $stderrPath -ErrorAction SilentlyContinue } else { @() }
        $output = @($stdout + $stderr | Where-Object { $_ -ne $null })
        if ($process.ExitCode -ne 0) {
            throw (($output | Out-String).Trim())
        }
    }
    finally {
        Remove-Item -LiteralPath $stdoutPath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
    }
    return @($output)
}

function Load-EnvFile {
    param([string]$PathValue)
    $result = @{}
    Get-Content $PathValue | ForEach-Object {
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

function Try-ReadText {
    param([string]$PathValue)
    try {
        return [string](Get-Content -LiteralPath $PathValue -Raw -ErrorAction Stop)
    }
    catch {
        return ""
    }
}

function Ensure-Api {
    param([string]$Name)
    $enabled = Run-GcloudCapture -CommandArgs @("services", "list", "--enabled", "--filter=config.name=$Name", "--format=value(config.name)")
    if (-not ($enabled | Where-Object { $_.ToString().Trim() -eq $Name })) {
        Write-Host "Enabling API: $Name"
        Run-GcloudCapture -CommandArgs @("services", "enable", $Name, "--project", $ProjectId) | Out-Null
    }
}

function Ensure-ArtifactRepository {
    try {
        Run-GcloudCapture -CommandArgs @("artifacts", "repositories", "describe", $ArtifactRepository, "--location=$Region", "--project=$ProjectId") | Out-Null
        return
    }
    catch {
    }
    Write-Host "Creating Artifact Registry repository: $ArtifactRepository"
    Run-GcloudCapture -CommandArgs @(
        "artifacts", "repositories", "create", $ArtifactRepository,
        "--repository-format=docker",
        "--location=$Region",
        "--project=$ProjectId"
    ) | Out-Null
}

function Ensure-SecretVersion {
    param(
        [string]$Name,
        [string]$Value
    )
    $tempFile = Join-Path $env:TEMP ("{0}.txt" -f ([guid]::NewGuid().ToString("N")))
    try {
        [System.IO.File]::WriteAllText($tempFile, $Value)
        $exists = $true
        try {
            Run-GcloudCapture -CommandArgs @("secrets", "describe", $Name, "--project=$ProjectId") | Out-Null
        }
        catch {
            $exists = $false
        }
        if (-not $exists) {
            Run-GcloudCapture -CommandArgs @("secrets", "create", $Name, "--replication-policy=automatic", "--project=$ProjectId") | Out-Null
        }
        Run-GcloudCapture -CommandArgs @("secrets", "versions", "add", $Name, "--data-file=$tempFile", "--project=$ProjectId") | Out-Null
    }
    finally {
        Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
    }
}

function Ensure-SecretVersionIfPresent {
    param(
        [string]$Name,
        [string]$Value
    )
    if ([string]::IsNullOrWhiteSpace($Value)) {
        return
    }
    Ensure-SecretVersion -Name $Name -Value $Value
}

function Ensure-SqlInstance {
    try {
        Run-GcloudCapture -CommandArgs @("sql", "instances", "describe", $SqlInstance, "--project=$ProjectId") | Out-Null
        return
    }
    catch {
    }
    $rootPassword = [guid]::NewGuid().ToString("N") + "R!"
    Ensure-SecretVersion -Name "supermega-db-root-password" -Value $rootPassword
    Write-Host "Creating Cloud SQL instance: $SqlInstance"
    Run-GcloudCapture -CommandArgs @(
        "sql", "instances", "create", $SqlInstance,
        "--project=$ProjectId",
        "--database-version=POSTGRES_15",
        "--tier=db-g1-small",
        "--region=$Region",
        "--storage-size=10",
        "--storage-auto-increase",
        "--availability-type=zonal",
        "--root-password=$rootPassword"
    ) | Out-Null
}

function Ensure-DatabaseAndUser {
    $dbNames = Run-GcloudCapture -CommandArgs @("sql", "databases", "list", "--instance=$SqlInstance", "--project=$ProjectId", "--format=value(name)")
    if (-not ($dbNames | Where-Object { $_.ToString().Trim() -eq $SqlDatabase })) {
        Run-GcloudCapture -CommandArgs @("sql", "databases", "create", $SqlDatabase, "--instance=$SqlInstance", "--project=$ProjectId") | Out-Null
    }

    $userNames = Run-GcloudCapture -CommandArgs @("sql", "users", "list", "--instance=$SqlInstance", "--project=$ProjectId", "--format=value(name)")
    $appPasswordSecretName = "supermega-db-app-password"
    $appPassword = [guid]::NewGuid().ToString("N") + "A!"
    if ($userNames | Where-Object { $_.ToString().Trim() -eq $SqlUser }) {
        Run-GcloudCapture -CommandArgs @(
            "sql", "users", "set-password", $SqlUser,
            "--instance=$SqlInstance",
            "--password=$appPassword",
            "--project=$ProjectId"
        ) | Out-Null
    }
    else {
        Run-GcloudCapture -CommandArgs @(
            "sql", "users", "create", $SqlUser,
            "--instance=$SqlInstance",
            "--password=$appPassword",
            "--project=$ProjectId"
        ) | Out-Null
    }
    Ensure-SecretVersion -Name $appPasswordSecretName -Value $appPassword
    $databaseUrl = "postgresql+psycopg://{0}:{1}@/{2}?host=/cloudsql/{3}:{4}:{5}" -f $SqlUser, $appPassword, $SqlDatabase, $ProjectId, $Region, $SqlInstance
    Ensure-SecretVersion -Name "supermega-database-url" -Value $databaseUrl
}

function New-CloudBuildConfig {
    param(
        [string]$PathValue,
        [string]$Image
    )
    $content = @"
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - --build-arg
      - VITE_GOOGLE_MAPS_API_KEY=`${_VITE_GOOGLE_MAPS_API_KEY}
      - --build-arg
      - VITE_BOOKING_URL=`${_VITE_BOOKING_URL}
      - --build-arg
      - VITE_POSTHOG_KEY=`${_VITE_POSTHOG_KEY}
      - --build-arg
      - VITE_POSTHOG_HOST=`${_VITE_POSTHOG_HOST}
      - --build-arg
      - VITE_SENTRY_DSN=`${_VITE_SENTRY_DSN}
      - --build-arg
      - VITE_WORKSPACE_APP_BASE=`${_VITE_WORKSPACE_APP_BASE}
      - --build-arg
      - VITE_WORKSPACE_API_BASE=`${_VITE_WORKSPACE_API_BASE}
      - -t
      - ${Image}
      - .
images:
  - ${Image}
"@
    [System.IO.File]::WriteAllText($PathValue, $content)
}

Require-Command -Name "gcloud"
Require-Command -Name "npm"

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $EnvFile) {
    $candidateEnvFiles = @(
        (Join-Path $repoRoot ".env.app.local"),
        "C:\Users\swann\OneDrive - BDA\swanhtet01.github.io.worktrees\copilot-worktree-2026-03-04T08-10-33\.env.app.local"
    )
    $EnvFile = ($candidateEnvFiles | Where-Object { Test-Path $_ } | Select-Object -First 1)
}

if (-not (Test-Path $EnvFile)) {
    throw "Env file not found: $EnvFile"
}
$envValues = Load-EnvFile -PathValue $EnvFile
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$image = "asia-southeast1-docker.pkg.dev/${ProjectId}/${ArtifactRepository}/${Service}:$timestamp"
$taskLocation = if ([string]::IsNullOrWhiteSpace([string]$envValues["SUPERMEGA_CLOUD_TASKS_LOCATION"])) { $Region } else { [string]$envValues["SUPERMEGA_CLOUD_TASKS_LOCATION"] }
$taskQueueDefault = if ([string]::IsNullOrWhiteSpace([string]$envValues["SUPERMEGA_CLOUD_TASKS_QUEUE_DEFAULT"])) { "supermega-agent-default" } else { [string]$envValues["SUPERMEGA_CLOUD_TASKS_QUEUE_DEFAULT"] }
$taskQueueBrowser = if ([string]::IsNullOrWhiteSpace([string]$envValues["SUPERMEGA_CLOUD_TASKS_QUEUE_BROWSER"])) { "supermega-agent-browser" } else { [string]$envValues["SUPERMEGA_CLOUD_TASKS_QUEUE_BROWSER"] }
$taskQueueBrief = if ([string]::IsNullOrWhiteSpace([string]$envValues["SUPERMEGA_CLOUD_TASKS_QUEUE_BRIEF"])) { "supermega-founder-brief" } else { [string]$envValues["SUPERMEGA_CLOUD_TASKS_QUEUE_BRIEF"] }
$taskWorkerUrl = "https://$AppDomain/api/internal/agent-runs/process-queue"
$resendFrom = if ([string]::IsNullOrWhiteSpace([string]$envValues["SUPERMEGA_RESEND_FROM"])) { "hello@supermega.dev" } else { [string]$envValues["SUPERMEGA_RESEND_FROM"] }
$contactNotifyEmail = if ([string]::IsNullOrWhiteSpace([string]$envValues["SUPERMEGA_CONTACT_NOTIFY_EMAIL"])) { $resendFrom } else { [string]$envValues["SUPERMEGA_CONTACT_NOTIFY_EMAIL"] }
$serviceAccountTemp = Join-Path $env:TEMP "supermega-service-account.json"
if ((Test-Path $ServiceAccountKey) -and (Try-ReadText -PathValue $ServiceAccountKey)) {
    [System.IO.File]::WriteAllText($serviceAccountTemp, (Try-ReadText -PathValue $ServiceAccountKey))
    Run-GcloudCapture -CommandArgs @("auth", "activate-service-account", "--key-file=$serviceAccountTemp", "--project=$ProjectId") | Out-Null
}
Run-GcloudCapture -CommandArgs @("config", "set", "project", $ProjectId) | Out-Null

foreach ($api in @(
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "serviceusage.googleapis.com"
)) {
    Ensure-Api -Name $api
}

Ensure-ArtifactRepository

if (-not $SkipSql) {
    Ensure-SqlInstance
    Ensure-DatabaseAndUser
}

Ensure-SecretVersionIfPresent -Name "supermega-app-username" -Value ([string]$envValues["SUPERMEGA_APP_USERNAME"])
Ensure-SecretVersionIfPresent -Name "supermega-app-password" -Value ([string]$envValues["SUPERMEGA_APP_PASSWORD"])
Ensure-SecretVersionIfPresent -Name "supermega-openai-api-key" -Value ([string]$envValues["OPENAI_API_KEY"])
Ensure-SecretVersionIfPresent -Name "supermega-google-maps-api-key" -Value ([string]$envValues["GOOGLE_MAPS_API_KEY"])
Ensure-SecretVersionIfPresent -Name "supermega-google-places-api-key" -Value ([string]$envValues["GOOGLE_PLACES_API_KEY"])
$internalCronToken = ""
try {
    $internalCronToken = ((Run-GcloudCapture -CommandArgs @("secrets", "versions", "access", "latest", "--secret=supermega-internal-cron-token", "--project=$ProjectId")) -join "`n").Trim()
}
catch {
    $internalCronToken = ""
}
if ([string]::IsNullOrWhiteSpace($internalCronToken)) {
    $internalCronToken = ("{0}{1}" -f ([guid]::NewGuid().ToString("N")), ([guid]::NewGuid().ToString("N")))
}
Ensure-SecretVersion -Name "supermega-internal-cron-token" -Value $internalCronToken
$serviceAccountJson = (Try-ReadText -PathValue $ServiceAccountKey).Trim()
$googleOauthClientJson = (Try-ReadText -PathValue $GoogleOAuthClient).Trim()
if ($serviceAccountJson) {
    Ensure-SecretVersion -Name "supermega-google-service-account-json" -Value $serviceAccountJson
}
if ($googleOauthClientJson) {
    Ensure-SecretVersion -Name "supermega-gmail-oauth-client-json" -Value $googleOauthClientJson
}

if (-not $SkipBuild) {
    $cloudBuildConfig = Join-Path $env:TEMP "supermega-cloudbuild.yaml"
    New-CloudBuildConfig -PathValue $cloudBuildConfig -Image $image
    try {
        $posthogKey = [string]$envValues["VITE_POSTHOG_KEY"]
        $posthogHost = if ([string]::IsNullOrWhiteSpace([string]$envValues["VITE_POSTHOG_HOST"])) { "https://us.i.posthog.com" } else { [string]$envValues["VITE_POSTHOG_HOST"] }
        $viteSentryDsn = [string]$envValues["VITE_SENTRY_DSN"]
        Run-GcloudCapture -CommandArgs @(
            "builds", "submit", $repoRoot,
            "--project=$ProjectId",
            "--config=$cloudBuildConfig",
            "--substitutions=_VITE_GOOGLE_MAPS_API_KEY=$([string]$envValues['GOOGLE_MAPS_API_KEY']),_VITE_BOOKING_URL=$BookingUrl,_VITE_POSTHOG_KEY=$posthogKey,_VITE_POSTHOG_HOST=$posthogHost,_VITE_SENTRY_DSN=$viteSentryDsn,_VITE_WORKSPACE_APP_BASE=https://$AppDomain,_VITE_WORKSPACE_API_BASE=https://$AppDomain"
        ) | Out-Null
    }
    finally {
        Remove-Item -LiteralPath $cloudBuildConfig -Force -ErrorAction SilentlyContinue
    }
}

if (-not $SkipDeploy) {
    $corsOrigins = "https://$PublicDomain,https://$AppDomain"
    $cloudSqlConnection = "${ProjectId}:${Region}:${SqlInstance}"
    $envVarsFile = Join-Path $env:TEMP ("supermega-run-env-{0}.yaml" -f ([guid]::NewGuid().ToString("N")))
    $envVarsContent = @"
SUPERMEGA_SITE_ROOT: /app/showroom/dist
SUPERMEGA_PILOT_DATA: /app/pilot-data
SUPERMEGA_ENV: production
SUPERMEGA_AUTH_REQUIRED: "1"
SUPERMEGA_GCP_PROJECT_ID: "$ProjectId"
SUPERMEGA_APP_DISPLAY_NAME: "SuperMega"
SUPERMEGA_APP_ROLE: "owner"
SUPERMEGA_WORKSPACE_SLUG: "supermega-lab"
SUPERMEGA_WORKSPACE_NAME: "SuperMega Lab"
SUPERMEGA_WORKSPACE_PLAN: "pilot"
SUPERMEGA_SESSION_HOURS: "336"
SUPERMEGA_CLOUD_TASKS_LOCATION: "$taskLocation"
SUPERMEGA_CLOUD_TASKS_QUEUE_DEFAULT: "$taskQueueDefault"
SUPERMEGA_CLOUD_TASKS_QUEUE_BROWSER: "$taskQueueBrowser"
SUPERMEGA_CLOUD_TASKS_QUEUE_BRIEF: "$taskQueueBrief"
SUPERMEGA_CLOUD_TASKS_WORKER_URL: "$taskWorkerUrl"
SUPERMEGA_CORS_ORIGINS: "$corsOrigins"
SUPERMEGA_RESEND_FROM: "$resendFrom"
SUPERMEGA_CONTACT_NOTIFY_EMAIL: "$contactNotifyEmail"
SUPERMEGA_SENTRY_TRACES: "$([string]$envValues['SUPERMEGA_SENTRY_TRACES'])"
SENTRY_DSN: "$([string]$envValues['SENTRY_DSN'])"
RESEND_API_KEY: "$([string]$envValues['RESEND_API_KEY'])"
VITE_BOOKING_URL: "$BookingUrl"
VITE_SENTRY_DSN: "$([string]$envValues['VITE_SENTRY_DSN'])"
VITE_WORKSPACE_APP_BASE: "https://$AppDomain"
VITE_WORKSPACE_API_BASE: "https://$AppDomain"
"@
    [System.IO.File]::WriteAllText($envVarsFile, $envVarsContent)
    try {
        Run-GcloudCapture -CommandArgs @(
            "run", "deploy", $Service,
            "--project=$ProjectId",
            "--image=$image",
            "--region=$Region",
            "--platform=managed",
            "--allow-unauthenticated",
            "--port=8080",
            "--cpu=1",
            "--memory=1Gi",
            "--min-instances=1",
            "--max-instances=1",
            "--add-cloudsql-instances=$cloudSqlConnection",
            "--env-vars-file=$envVarsFile",
            "--set-secrets=SUPERMEGA_APP_USERNAME=supermega-app-username:latest,SUPERMEGA_APP_PASSWORD=supermega-app-password:latest,SUPERMEGA_DATABASE_URL=supermega-database-url:latest,OPENAI_API_KEY=supermega-openai-api-key:latest,GOOGLE_MAPS_API_KEY=supermega-google-maps-api-key:latest,GOOGLE_PLACES_API_KEY=supermega-google-places-api-key:latest,SUPERMEGA_INTERNAL_CRON_TOKEN=supermega-internal-cron-token:latest"
        ) | Out-Null
    }
    finally {
        Remove-Item -LiteralPath $envVarsFile -Force -ErrorAction SilentlyContinue
    }
}

$serviceUrl = ""
if (-not $SkipDeploy) {
    $serviceUrl = (Run-GcloudCapture -CommandArgs @("run", "services", "describe", $Service, "--project=$ProjectId", "--region=$Region", "--format=value(status.url)")) | Select-Object -First 1
}

@{
    status = if ($SkipDeploy) { "prepared" } else { "ready" }
    project_id = $ProjectId
    region = $Region
    service = $Service
    service_url = [string]$serviceUrl
    app_domain = $AppDomain
    public_domain = $PublicDomain
    sql_instance = $SqlInstance
    artifact_repository = $ArtifactRepository
} | ConvertTo-Json -Depth 5

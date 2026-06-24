param(
    [string]$ProjectId = "supermega-468612",
    [string]$Region = "asia-southeast1",
    [string]$Service = "supermega-app",
    [string]$AppDomain = "app.supermega.dev",
    [string]$TimeZone = "Asia/Yangon",
    [switch]$RotateCronToken
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

function Invoke-Gcloud {
    param([string[]]$CommandArgs)
    & gcloud @CommandArgs
    if ($LASTEXITCODE -ne 0) {
        throw "gcloud failed: gcloud $($CommandArgs -join ' ')"
    }
}

function Invoke-GcloudCapture {
    param([string[]]$CommandArgs)
    $output = & gcloud @CommandArgs
    if ($LASTEXITCODE -ne 0) {
        throw "gcloud failed: gcloud $($CommandArgs -join ' ')"
    }
    return @($output)
}

function Ensure-SecretVersion {
    param(
        [string]$Name,
        [string]$Value
    )

    $tempFile = Join-Path $env:TEMP ("{0}.txt" -f ([guid]::NewGuid().ToString("N")))
    try {
        [System.IO.File]::WriteAllText($tempFile, $Value)
        try {
            Invoke-GcloudCapture -CommandArgs @("secrets", "describe", $Name, "--project=$ProjectId") | Out-Null
        }
        catch {
            Invoke-Gcloud -CommandArgs @("secrets", "create", $Name, "--replication-policy=automatic", "--project=$ProjectId")
        }
        Invoke-Gcloud -CommandArgs @("secrets", "versions", "add", $Name, "--data-file=$tempFile", "--project=$ProjectId")
    }
    finally {
        Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
    }
}

function Ensure-SchedulerJob {
    param(
        [string]$Name,
        [string]$Schedule,
        [string]$Uri,
        [string]$Body
    )

    $bodyFile = Join-Path $env:TEMP ("supermega-scheduler-{0}.json" -f ([guid]::NewGuid().ToString("N")))
    try {
        [System.IO.File]::WriteAllText($bodyFile, $Body)
        $commonArgs = @(
            $Name,
            "--project=$ProjectId",
            "--location=$Region",
            "--schedule=$Schedule",
            "--time-zone=$TimeZone",
            "--uri=$Uri",
            "--http-method=POST",
            "--message-body-from-file=$bodyFile",
            "--attempt-deadline=180s"
        )

        try {
            Invoke-GcloudCapture -CommandArgs @("scheduler", "jobs", "describe", $Name, "--project=$ProjectId", "--location=$Region") | Out-Null
            $updateArgs = @("scheduler", "jobs", "update", "http") + $commonArgs + @("--update-headers=Content-Type=application/json,x-supermega-cron-token=$cronToken")
            Invoke-Gcloud -CommandArgs $updateArgs | Out-Null
        }
        catch {
            $createArgs = @("scheduler", "jobs", "create", "http") + $commonArgs + @("--headers=Content-Type=application/json,x-supermega-cron-token=$cronToken")
            Invoke-Gcloud -CommandArgs $createArgs | Out-Null
        }
    }
    finally {
        Remove-Item -LiteralPath $bodyFile -Force -ErrorAction SilentlyContinue
    }
}

Require-Command -Name "gcloud"

$serviceUrl = ((Invoke-GcloudCapture -CommandArgs @(
    "run", "services", "describe", $Service,
    "--project=$ProjectId",
    "--region=$Region",
    "--format=value(status.url)"
)) -join "`n").Trim()

if ([string]::IsNullOrWhiteSpace($serviceUrl)) {
    throw "Could not resolve Cloud Run service URL for $Service."
}

$enqueueUri = "https://$AppDomain/api/internal/agent-runs/enqueue-defaults"
$workerUri = "https://$AppDomain/api/internal/agent-runs/process-queue"
$cronToken = ""
try {
    $cronToken = ((Invoke-GcloudCapture -CommandArgs @("secrets", "versions", "access", "latest", "--secret=supermega-internal-cron-token", "--project=$ProjectId")) -join "`n").Trim()
}
catch {
    $cronToken = ""
}
if ($RotateCronToken -or [string]::IsNullOrWhiteSpace($cronToken)) {
    $cronToken = ("{0}{1}" -f ([guid]::NewGuid().ToString("N")), ([guid]::NewGuid().ToString("N")))
}
Ensure-SecretVersion -Name "supermega-internal-cron-token" -Value $cronToken

Invoke-Gcloud -CommandArgs @(
    "run", "services", "update", $Service,
    "--project=$ProjectId",
    "--region=$Region",
    "--update-secrets=SUPERMEGA_INTERNAL_CRON_TOKEN=supermega-internal-cron-token:latest"
) | Out-Null

Ensure-SchedulerJob -Name "supermega-default-agent-jobs" -Schedule "0 */2 * * *" -Uri $enqueueUri -Body '{"source":"scheduler","job_types":["revenue_scout","list_clerk","task_triage","template_clerk","github_release_watch"]}'
Ensure-SchedulerJob -Name "supermega-ops-watch" -Schedule "*/15 * * * *" -Uri $enqueueUri -Body '{"source":"scheduler","job_types":["ops_watch"]}'
Ensure-SchedulerJob -Name "supermega-founder-brief-daily" -Schedule "0 8 * * *" -Uri $enqueueUri -Body '{"source":"scheduler","job_types":["founder_brief"]}'
Ensure-SchedulerJob -Name "supermega-agent-worker" -Schedule "*/5 * * * *" -Uri $workerUri -Body '{"source":"worker","limit":12}'

@{
    status = "ready"
    project_id = $ProjectId
    region = $Region
    service = $Service
    service_url = $serviceUrl
    enqueue_uri = $enqueueUri
    worker_uri = $workerUri
    jobs = @(
        [ordered]@{ name = "supermega-default-agent-jobs"; schedule = "0 */2 * * *"; uri = $enqueueUri },
        [ordered]@{ name = "supermega-ops-watch"; schedule = "*/15 * * * *"; uri = $enqueueUri },
        [ordered]@{ name = "supermega-founder-brief-daily"; schedule = "0 8 * * *"; uri = $enqueueUri },
        [ordered]@{ name = "supermega-agent-worker"; schedule = "*/5 * * * *"; uri = $workerUri }
    )
} | ConvertTo-Json -Depth 5

param(
    [string]$ProjectId = "supermega-468612",
    [string]$Region = "asia-southeast1",
    [string]$Service = "supermega-app",
    [string]$AppDomain = "app.supermega.dev",
    [string]$TimeZone = "Asia/Yangon",
    [switch]$RotateCronToken,
    [ValidateSet("unchanged", "demand-driven-canary", "polling")]
    [string]$WorkerDispatchMode = "unchanged",
    [string]$WorkerCanaryEvidencePath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

function Get-GcloudOperation {
    param([string[]]$CommandArgs)

    $segments = @()
    foreach ($argument in $CommandArgs) {
        $candidate = [string]$argument
        if ($candidate -notmatch '^[a-z][a-z0-9-]{0,31}$') {
            break
        }
        $segments += $candidate
        if ($segments.Count -ge 3) {
            break
        }
    }
    if ($segments.Count -eq 0) {
        return "unknown"
    }
    return ($segments -join " ")
}

function Invoke-GcloudSafe {
    param([string[]]$CommandArgs)

    # Capture both native streams so a failed command cannot echo a secret-bearing
    # header, data-file path, or token argument into CI or terminal diagnostics.
    $commandOutput = @(& gcloud @CommandArgs 2>&1)
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        $operation = Get-GcloudOperation -CommandArgs $CommandArgs
        throw "gcloud operation '$operation' failed with exit code $exitCode."
    }
    return $commandOutput
}

function Invoke-Gcloud {
    param([string[]]$CommandArgs)
    Invoke-GcloudSafe -CommandArgs $CommandArgs
}

function Invoke-GcloudCapture {
    param([string[]]$CommandArgs)
    return @(Invoke-GcloudSafe -CommandArgs $CommandArgs)
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

function Read-WorkerCanaryEvidence {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "WorkerCanaryEvidencePath is required for demand-driven-canary mode."
    }
    $resolvedPath = [System.IO.Path]::GetFullPath($Path)
    if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
        throw "Worker canary evidence file was not found: $resolvedPath"
    }
    $evidence = Get-Content -LiteralPath $resolvedPath -Raw | ConvertFrom-Json
    $requiredFields = @(
        "contract",
        "project_id",
        "region",
        "service",
        "task_dispatch_source",
        "queued_task_id",
        "worker_invocation_id",
        "polling_job_paused_during_probe",
        "queue_to_worker_seconds",
        "observed_at",
        "result"
    )
    $presentFields = @($evidence.PSObject.Properties.Name)
    foreach ($field in $requiredFields) {
        if ($field -notin $presentFields) {
            throw "Worker canary evidence is missing $field."
        }
    }
    if ($evidence.contract -ne "supermega.agent_worker_canary.v1" -or
        $evidence.project_id -ne $ProjectId -or
        $evidence.region -ne $Region -or
        $evidence.service -ne $Service -or
        $evidence.task_dispatch_source -ne "cloud-tasks" -or
        $evidence.polling_job_paused_during_probe -ne $true -or
        $evidence.result -ne "processed" -or
        [string]::IsNullOrWhiteSpace(([string]$evidence.queued_task_id)) -or
        [string]::IsNullOrWhiteSpace(([string]$evidence.worker_invocation_id))) {
        throw "Worker canary evidence does not prove one queue-only worker invocation for this service."
    }
    $latencySeconds = [double]$evidence.queue_to_worker_seconds
    if ($latencySeconds -lt 0 -or $latencySeconds -gt 300) {
        throw "Worker canary queue-to-worker latency must be between 0 and 300 seconds."
    }
    $observedAt = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse([string]$evidence.observed_at, [ref]$observedAt)) {
        throw "Worker canary observed_at must be an ISO-8601 timestamp."
    }
    $evidenceAge = [DateTimeOffset]::UtcNow - $observedAt.ToUniversalTime()
    if ($evidenceAge.TotalMinutes -lt -5 -or $evidenceAge.TotalHours -gt 24) {
        throw "Worker canary evidence must be no more than 24 hours old and cannot be from the future."
    }
    return $evidence
}

Require-Command -Name "gcloud"

$workerCanaryEvidence = $null
if ($WorkerDispatchMode -eq "demand-driven-canary") {
    $workerCanaryEvidence = Read-WorkerCanaryEvidence -Path $WorkerCanaryEvidencePath
}

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
$cronTokenChanged = $RotateCronToken -or [string]::IsNullOrWhiteSpace($cronToken)
if ($cronTokenChanged) {
    $cronToken = ("{0}{1}" -f ([guid]::NewGuid().ToString("N")), ([guid]::NewGuid().ToString("N")))
    Ensure-SecretVersion -Name "supermega-internal-cron-token" -Value $cronToken
}

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

$workerSchedulerState = ((Invoke-GcloudCapture -CommandArgs @(
    "scheduler", "jobs", "describe", "supermega-agent-worker",
    "--project=$ProjectId",
    "--location=$Region",
    "--format=value(state)"
)) -join "`n").Trim().ToUpperInvariant()
if ($WorkerDispatchMode -eq "demand-driven-canary" -and $workerSchedulerState -ne "PAUSED") {
    Invoke-Gcloud -CommandArgs @("scheduler", "jobs", "pause", "supermega-agent-worker", "--project=$ProjectId", "--location=$Region") | Out-Null
} elseif ($WorkerDispatchMode -eq "polling" -and $workerSchedulerState -eq "PAUSED") {
    Invoke-Gcloud -CommandArgs @("scheduler", "jobs", "resume", "supermega-agent-worker", "--project=$ProjectId", "--location=$Region") | Out-Null
}
$workerSchedulerState = ((Invoke-GcloudCapture -CommandArgs @(
    "scheduler", "jobs", "describe", "supermega-agent-worker",
    "--project=$ProjectId",
    "--location=$Region",
    "--format=value(state)"
)) -join "`n").Trim().ToUpperInvariant()
if ($WorkerDispatchMode -eq "demand-driven-canary" -and $workerSchedulerState -ne "PAUSED") {
    throw "Demand-driven worker canary requested, but the polling job is not paused."
}
if ($WorkerDispatchMode -eq "polling" -and $workerSchedulerState -eq "PAUSED") {
    throw "Polling rollback requested, but the worker scheduler remains paused."
}

@{
    status = "ready"
    project_id = $ProjectId
    region = $Region
    service = $Service
    service_url = $serviceUrl
    enqueue_uri = $enqueueUri
    worker_uri = $workerUri
    cron_token_changed = $cronTokenChanged
    worker_dispatch_mode = $WorkerDispatchMode
    worker_scheduler_state = $workerSchedulerState
    worker_canary_evidence_validated = $null -ne $workerCanaryEvidence
    nominal_scheduler_calls_per_day = if ($workerSchedulerState -eq "PAUSED") { 109 } else { 397 }
    worker_poll_calls_per_day = if ($workerSchedulerState -eq "PAUSED") { 0 } else { 288 }
    polling_rollback = "Run this script with -WorkerDispatchMode polling."
    jobs = @(
        [ordered]@{ name = "supermega-default-agent-jobs"; schedule = "0 */2 * * *"; uri = $enqueueUri },
        [ordered]@{ name = "supermega-ops-watch"; schedule = "*/15 * * * *"; uri = $enqueueUri },
        [ordered]@{ name = "supermega-founder-brief-daily"; schedule = "0 8 * * *"; uri = $enqueueUri },
        [ordered]@{ name = "supermega-agent-worker"; schedule = "*/5 * * * *"; uri = $workerUri; state = $workerSchedulerState }
    )
} | ConvertTo-Json -Depth 5

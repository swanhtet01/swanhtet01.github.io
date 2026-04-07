param(
    [string]$ProjectId = "supermega-468612",
    [string]$Region = "asia-southeast1",
    [string]$Service = "supermega-app",
    [string]$DefaultQueue = "supermega-agent-default",
    [string]$BrowserQueue = "supermega-agent-browser",
    [string]$BriefQueue = "supermega-founder-brief"
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

function Ensure-Queue {
    param(
        [string]$Name,
        [double]$DispatchPerSecond,
        [int]$MaxConcurrent,
        [int]$MaxAttempts,
        [string]$MinBackoff,
        [string]$MaxBackoff
    )

    $commonArgs = @(
        $Name,
        "--project=$ProjectId",
        "--location=$Region",
        "--max-dispatches-per-second=$DispatchPerSecond",
        "--max-concurrent-dispatches=$MaxConcurrent",
        "--max-attempts=$MaxAttempts",
        "--min-backoff=$MinBackoff",
        "--max-backoff=$MaxBackoff"
    )

    try {
        Invoke-GcloudCapture -CommandArgs @("tasks", "queues", "describe", $Name, "--project=$ProjectId", "--location=$Region") | Out-Null
        Invoke-Gcloud -CommandArgs (@("tasks", "queues", "update") + $commonArgs) | Out-Null
    }
    catch {
        Invoke-Gcloud -CommandArgs (@("tasks", "queues", "create") + $commonArgs) | Out-Null
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

$workerUrl = "$serviceUrl/api/internal/agent-runs/process-queue"

Ensure-Queue -Name $DefaultQueue -DispatchPerSecond 2 -MaxConcurrent 4 -MaxAttempts 10 -MinBackoff "10s" -MaxBackoff "600s"
Ensure-Queue -Name $BrowserQueue -DispatchPerSecond 0.5 -MaxConcurrent 1 -MaxAttempts 5 -MinBackoff "30s" -MaxBackoff "1800s"
Ensure-Queue -Name $BriefQueue -DispatchPerSecond 0.2 -MaxConcurrent 1 -MaxAttempts 5 -MinBackoff "60s" -MaxBackoff "3600s"

Invoke-Gcloud -CommandArgs @(
    "run", "services", "update", $Service,
    "--project=$ProjectId",
    "--region=$Region",
    "--update-env-vars=SUPERMEGA_GCP_PROJECT_ID=$ProjectId,SUPERMEGA_CLOUD_TASKS_LOCATION=$Region,SUPERMEGA_CLOUD_TASKS_QUEUE_DEFAULT=$DefaultQueue,SUPERMEGA_CLOUD_TASKS_QUEUE_BROWSER=$BrowserQueue,SUPERMEGA_CLOUD_TASKS_QUEUE_BRIEF=$BriefQueue,SUPERMEGA_CLOUD_TASKS_WORKER_URL=$workerUrl"
) | Out-Null

@{
    status = "ready"
    project_id = $ProjectId
    region = $Region
    service = $Service
    service_url = $serviceUrl
    worker_url = $workerUrl
    queues = @(
        [ordered]@{ name = $DefaultQueue; dispatches_per_second = 2; max_concurrent = 4 },
        [ordered]@{ name = $BrowserQueue; dispatches_per_second = 0.5; max_concurrent = 1 },
        [ordered]@{ name = $BriefQueue; dispatches_per_second = 0.2; max_concurrent = 1 }
    )
} | ConvertTo-Json -Depth 4

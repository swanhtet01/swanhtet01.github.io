param()

# Compatibility entry point retained so old operator instructions fail safely.
# Vercel production Cron is the sole recurring scheduler; Cloud Tasks remains
# an on-demand worker transport and Google Cloud Scheduler mutation is retired.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$authorityPath = Join-Path $PSScriptRoot "supermega_scheduler_authority.json"
if (-not (Test-Path -LiteralPath $authorityPath -PathType Leaf)) {
    throw "scheduler_authority_contract_missing"
}

$authority = Get-Content -LiteralPath $authorityPath -Raw | ConvertFrom-Json
if ($authority.contract -ne "supermega.scheduler-authority.v1" -or
    $authority.authority -ne "vercel" -or
    $authority.environment -ne "production" -or
    $authority.project_id -ne "prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG" -or
    $authority.project_name -ne "megaos" -or
    $authority.worker_dispatch.mode -ne "enqueue-on-demand" -or
    $authority.worker_dispatch.polling_allowed -ne $false -or
    $authority.retired_authority.provider -ne "google-cloud-scheduler" -or
    $authority.retired_authority.mutation_allowed -ne $false) {
    throw "scheduler_authority_contract_invalid"
}

$crons = @($authority.crons)
if ($crons.Count -ne 2 -or
    @($crons | Where-Object { $_.path -eq "/api/cron/supermega/agent-queue" -and $_.schedule -eq "*/15 * * * *" }).Count -ne 1 -or
    @($crons | Where-Object { $_.path -eq "/api/cron/supermega/daily" -and $_.schedule -eq "45 0 * * *" }).Count -ne 1 -or
    [int]$authority.maximum_scheduler_invocations_per_day -ne 97) {
    throw "scheduler_cadence_contract_invalid"
}

[ordered]@{
    contract = $authority.contract
    status = "retired_compatibility_entrypoint"
    scheduler_authority = $authority.authority
    environment = $authority.environment
    project_id = $authority.project_id
    cron_count = $crons.Count
    maximum_scheduler_invocations_per_day = [int]$authority.maximum_scheduler_invocations_per_day
    worker_dispatch = $authority.worker_dispatch.mode
    gcp_scheduler_mutation_allowed = $false
    provider_reads_performed = $false
    provider_writes_performed = $false
    next_action = "Use the owner-gated Vercel release contract; do not recreate Google Cloud Scheduler jobs."
} | ConvertTo-Json -Depth 5

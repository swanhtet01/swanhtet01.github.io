param()

# Compatibility entry point retained so old operator instructions fail safely.
# Vercel is the sole permitted recurring scheduler, but registration remains
# dormant until the checked managed-runtime activation evidence passes.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$authorityPath = Join-Path $PSScriptRoot "supermega_scheduler_authority.json"
if (-not (Test-Path -LiteralPath $authorityPath -PathType Leaf)) {
    throw "scheduler_authority_contract_missing"
}

$authority = Get-Content -LiteralPath $authorityPath -Raw | ConvertFrom-Json
if ($authority.contract -ne "supermega.scheduler-authority.v2" -or
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
$activationCrons = @($authority.activation_plan.crons)
$retiringCrons = @($authority.migration.preflight_retiring_crons)
if ($authority.activation.state -ne "dormant" -or
    $authority.activation.runtime_environment_key -ne "SUPERMEGA_HOSTED_SCHEDULER_ENABLED" -or
    $authority.activation.enabled_value -ne "1" -or
    $crons.Count -ne 0 -or
    [int]$authority.maximum_scheduler_invocations_per_day -ne 0 -or
    $activationCrons.Count -ne 2 -or
    @($activationCrons | Where-Object { $_.path -eq "/api/cron/supermega/agent-queue" -and $_.schedule -eq "5 * * * *" }).Count -ne 1 -or
    @($activationCrons | Where-Object { $_.path -eq "/api/cron/supermega/daily" -and $_.schedule -eq "45 0 * * *" }).Count -ne 1 -or
    [int]$authority.activation_plan.maximum_scheduler_invocations_per_day -ne 25 -or
    $retiringCrons.Count -ne 2 -or
    @($retiringCrons | Where-Object { $_.path -eq "/api/cron/supermega/agent-queue" -and $_.schedule -eq "*/15 * * * *" }).Count -ne 1 -or
    @($retiringCrons | Where-Object { $_.path -eq "/api/cron/supermega/daily" -and $_.schedule -eq "45 0 * * *" }).Count -ne 1 -or
    $authority.migration.post_deploy_retiring_crons_allowed -ne $false) {
    throw "scheduler_cadence_contract_invalid"
}

[ordered]@{
    contract = $authority.contract
    status = "retired_compatibility_entrypoint"
    scheduler_authority = $authority.authority
    environment = $authority.environment
    project_id = $authority.project_id
    activation_state = $authority.activation.state
    cron_count = $crons.Count
    maximum_scheduler_invocations_per_day = [int]$authority.maximum_scheduler_invocations_per_day
    activation_plan_cron_count = $activationCrons.Count
    activation_plan_maximum_invocations_per_day = [int]$authority.activation_plan.maximum_scheduler_invocations_per_day
    worker_dispatch = $authority.worker_dispatch.mode
    gcp_scheduler_mutation_allowed = $false
    provider_reads_performed = $false
    provider_writes_performed = $false
    next_action = "Keep crons absent until managed security, worker, rollback, and owner activation evidence pass."
} | ConvertTo-Json -Depth 5

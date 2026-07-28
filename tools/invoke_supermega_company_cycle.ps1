[CmdletBinding()]
param(
    [ValidateSet('revenue_scout', 'list_clerk', 'task_triage', 'template_clerk', 'ops_watch', 'founder_brief', 'github_release_watch')]
    [string]$JobType = 'ops_watch',
    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,62}$')]
    [string]$Workspace = 'supermega-lab',
    [string]$BaseUrl = '',
    [switch]$Json,
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Contract = 'supermega.ally-company-cycle.v1'
$HostAdmissionContract = 'supermega.ally-host-admission.v1'
$LeaseContract = 'supermega.ally-company-cycle-lease.v1'
$LeaseName = 'Local\SuperMega.AllyCompanyCycle.v1'

function Enter-LocalCycleLease {
    param([string]$Name)
    try { $semaphore = [System.Threading.Semaphore]::new(1, 1, $Name) }
    catch { throw 'ally_local_cycle_lease_unavailable' }
    try { $acquired = $semaphore.WaitOne(0) }
    catch {
        $semaphore.Dispose()
        throw 'ally_local_cycle_lease_unavailable'
    }
    if (-not $acquired) {
        $semaphore.Dispose()
        throw 'ally_local_cycle_busy'
    }
    [pscustomobject]@{
        contract = $LeaseContract
        name = $Name
        semaphore = $semaphore
    }
}

function Exit-LocalCycleLease {
    param([pscustomobject]$Lease)
    if ($null -eq $Lease -or $Lease.contract -ne $LeaseContract -or $null -eq $Lease.semaphore) { return }
    try { $Lease.semaphore.Release() | Out-Null }
    finally { $Lease.semaphore.Dispose() }
}

function Get-DispatchDecision {
    param(
        [pscustomobject]$Audit,
        [string[]]$RequestedJobs
    )
    if ($Audit.contract -ne 'supermega.ally-runtime-audit.v1' -or $Audit.mode -ne 'read_only') { throw 'ally_audit_contract_invalid' }
    if ($Audit.hostAdmission.contract -ne $HostAdmissionContract) { throw 'ally_host_admission_contract_invalid' }
    if ($RequestedJobs.Count -ne 1 -or [string]::IsNullOrWhiteSpace($RequestedJobs[0])) { throw 'ally_local_job_limit_exceeded' }
    if (-not [bool]$Audit.hostAdmission.eligible -or [int]$Audit.hostAdmission.maxConcurrentLocalRuns -ne 1) {
        $codes = @($Audit.hostAdmission.blockers | ForEach-Object { [string]$_ })
        throw "ally_host_admission_blocked:$($codes -join ',')"
    }
    [pscustomobject]@{
        contract = $Contract
        admitted = $true
        jobType = $RequestedJobs[0]
        maxConcurrentLocalRuns = 1
        auditGeneratedAt = [string]$Audit.generatedAt
    }
}

function Invoke-SelfTest {
    $healthy = [pscustomobject]@{
        contract = 'supermega.ally-runtime-audit.v1'
        mode = 'read_only'
        generatedAt = '2026-07-28T00:00:00Z'
        hostAdmission = [pscustomobject]@{ contract = $HostAdmissionContract; eligible = $true; maxConcurrentLocalRuns = 1; blockers = @() }
    }
    $decision = Get-DispatchDecision $healthy @('ops_watch')
    if (-not $decision.admitted -or $decision.jobType -ne 'ops_watch') { throw 'healthy_dispatch_failed' }
    foreach ($fixture in @(
        [pscustomobject]@{ audit = [pscustomobject]@{ contract = 'wrong'; mode = 'read_only'; hostAdmission = $healthy.hostAdmission }; jobs = @('ops_watch'); error = 'ally_audit_contract_invalid' },
        [pscustomobject]@{ audit = $healthy; jobs = @('ops_watch', 'task_triage'); error = 'ally_local_job_limit_exceeded' },
        [pscustomobject]@{ audit = [pscustomobject]@{ contract = $healthy.contract; mode = $healthy.mode; hostAdmission = [pscustomobject]@{ contract = $HostAdmissionContract; eligible = $false; maxConcurrentLocalRuns = 0; blockers = @('memory_pressure_critical') } }; jobs = @('ops_watch'); error = 'ally_host_admission_blocked:memory_pressure_critical' }
    )) {
        try { Get-DispatchDecision $fixture.audit $fixture.jobs | Out-Null; throw 'fixture_should_reject' }
        catch { if ($_.Exception.Message -ne $fixture.error) { throw } }
    }
    $lease = Enter-LocalCycleLease $LeaseName
    try {
        try { Enter-LocalCycleLease $LeaseName | Out-Null; throw 'fixture_should_reject' }
        catch { if ($_.Exception.Message -ne 'ally_local_cycle_busy') { throw } }
    }
    finally { Exit-LocalCycleLease $lease }
    $recoveredLease = Enter-LocalCycleLease $LeaseName
    Exit-LocalCycleLease $recoveredLease
    [pscustomobject]@{ ok = $true; contract = $Contract; hostAdmissionContract = $HostAdmissionContract; leaseContract = $LeaseContract; checks = 6; networkRequests = 0; processMutation = $false }
}

if ($SelfTest) {
    $result = Invoke-SelfTest
    if ($Json) { $result | ConvertTo-Json -Depth 5 -Compress } else { $result | Format-List }
    exit 0
}

$cycleLease = Enter-LocalCycleLease $LeaseName
try {
    $auditRaw = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'audit_ally_runtime.ps1') -Json
    if ($LASTEXITCODE -ne 0) { throw "ally_audit_failed:$LASTEXITCODE" }
    try { $audit = $auditRaw | ConvertFrom-Json }
    catch { throw 'ally_audit_json_invalid' }
    $decision = Get-DispatchDecision $audit @($JobType)

    $runnerArguments = @(
        (Join-Path $PSScriptRoot 'run_supermega_agent_jobs.py'),
        '--workspace', $Workspace,
        '--job-type', $JobType,
        '--as-json'
    )
    if (-not [string]::IsNullOrWhiteSpace($BaseUrl)) { $runnerArguments += @('--base-url', $BaseUrl) }
    $runnerRaw = & python @runnerArguments
    if ($LASTEXITCODE -ne 0) { throw "company_cycle_runner_failed:$LASTEXITCODE" }
    try { $runner = $runnerRaw | ConvertFrom-Json }
    catch { throw 'company_cycle_runner_json_invalid' }

    $report = [ordered]@{
        contract = $Contract
        status = 'completed'
        jobType = $JobType
        workspace = $Workspace
        hostAdmission = $decision
        localCycleLease = [ordered]@{
            contract = $LeaseContract
            mode = 'single_flight'
            releasePolicy = 'finally'
        }
        runner = $runner
    }
    if ($Json) { $report | ConvertTo-Json -Depth 10 -Compress }
    else {
        'SuperMega local company cycle completed.'
        "Job: $JobType"
        'Host admission: one local run, scale to zero after completion.'
    }
}
finally {
    Exit-LocalCycleLease $cycleLease
}

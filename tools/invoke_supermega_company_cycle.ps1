[CmdletBinding()]
param(
    [switch]$Preflight,
    [switch]$Scheduled,
    [switch]$RecordResult,
    [switch]$Json,
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Contract = 'supermega.ally-company-cycle.v2'
$CeoCycleContract = 'supermega.ally-ceo-local-cycle.v1'
$OwnerBriefContract = 'supermega.ally-ceo-owner-brief.v1'
$LeaseContract = 'supermega.ally-company-cycle-lease.v1'
$LeaseName = 'Local\SuperMega.AllyCompanyCycle.v1'
$DeferredReasons = @(
    'ally_ceo_local_cycle_host_blocked:',
    'ally_ceo_local_cycle_command_failed:audit:',
    'ally_ceo_local_cycle_host_not_idle',
    'ally_ceo_local_cycle_final_host_not_idle',
    'ally_ceo_local_cycle_company_not_idle',
    'ally_ceo_local_cycle_model_unavailable'
)
$StateRoot = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'supermega-local-company-state'
$ReceiptPath = Join-Path $StateRoot 'ally-ceo-cycle-last.json'
$MaxReceiptBytes = 64 * 1024
$NodePath = 'C:\Users\thesw\tools\node-v24.18.0-win-x64\node.exe'

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

function Test-DeferredReason {
    param([string]$Reason)
    foreach ($allowed in $DeferredReasons) {
        if ($allowed.EndsWith(':')) {
            if ($Reason.StartsWith($allowed, [System.StringComparison]::Ordinal)) { return $true }
        }
        elseif ($Reason -eq $allowed) { return $true }
    }
    return $false
}

function ConvertFrom-RunnerOutput {
    param([object[]]$Lines)
    for ($index = $Lines.Count - 1; $index -ge 0; $index--) {
        $text = [string]$Lines[$index]
        $start = $text.IndexOf('{')
        $end = $text.LastIndexOf('}')
        if ($start -lt 0 -or $end -le $start) { continue }
        try { $candidate = $text.Substring($start, $end - $start + 1) | ConvertFrom-Json }
        catch { continue }
        if ($candidate.PSObject.Properties.Name -contains 'ok') { return $candidate }
    }
    throw 'ally_company_cycle_runner_json_invalid'
}

function Save-CycleReceipt {
    param([pscustomobject]$Report)
    $rootItem = Get-Item -LiteralPath $StateRoot -ErrorAction Stop
    if (-not $rootItem.PSIsContainer -or ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'ally_company_cycle_state_root_unsafe'
    }
    if (Test-Path -LiteralPath $ReceiptPath) {
        $existing = Get-Item -LiteralPath $ReceiptPath -ErrorAction Stop
        if ($existing.PSIsContainer -or ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $existing.Length -gt $MaxReceiptBytes) {
            throw 'ally_company_cycle_receipt_path_unsafe'
        }
    }
    $serialized = $Report | ConvertTo-Json -Depth 10 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($serialized + "`n")
    if ($bytes.Length -lt 2 -or $bytes.Length -gt $MaxReceiptBytes) { throw 'ally_company_cycle_receipt_size_invalid' }
    $temporary = Join-Path $StateRoot ('.ally-ceo-cycle-last.' + [guid]::NewGuid().ToString('N') + '.tmp')
    $backup = Join-Path $StateRoot ('.ally-ceo-cycle-last.' + [guid]::NewGuid().ToString('N') + '.bak')
    try {
        $stream = [IO.FileStream]::new($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None, 4096, [IO.FileOptions]::WriteThrough)
        try {
            $stream.Write($bytes, 0, $bytes.Length)
            $stream.Flush($true)
        }
        finally { $stream.Dispose() }
        if (Test-Path -LiteralPath $ReceiptPath) {
            [IO.File]::Replace($temporary, $ReceiptPath, $backup, $true)
        }
        else { [IO.File]::Move($temporary, $ReceiptPath) }
    }
    finally {
        if (Test-Path -LiteralPath $temporary) { [IO.File]::Delete($temporary) }
        if (Test-Path -LiteralPath $backup) { [IO.File]::Delete($backup) }
    }
    [pscustomobject]@{ path = $ReceiptPath; bytes = $bytes.Length }
}

function ConvertTo-DeferredCycle {
    param([string]$Reason)
    if (-not (Test-DeferredReason $Reason)) { throw "ally_company_cycle_runner_failed:$Reason" }
    [pscustomobject]@{
        contract = $Contract
        generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
        status = 'deferred'
        reason = $Reason
        retryPolicy = 'next_scheduled_cycle'
        modelCalls = 0
        queueWrites = 0
        controls = [ordered]@{
            externalWrites = $false
            connectorRequests = 0
            vercelActions = 0
            hostedSchedulerActions = 0
            maxConcurrentLocalRuns = 1
            scaleToZero = $true
        }
    }
}

function ConvertTo-CycleReport {
    param(
        [pscustomobject]$Receipt,
        [int]$ExitCode,
        [bool]$Execute
    )
    $allowedStatuses = @(
        'ready', 'accepted', 'quality_failed', 'existing', 'existing_rejected', 'deferred',
        'period_complete', 'period_incomplete'
    )
    $receiptProperties = @($Receipt.PSObject.Properties.Name)
    foreach ($required in @('ok', 'contract', 'status', 'controls', 'ownerBrief', 'modelCalls', 'queueWrites', 'completedOutcomeIds')) {
        if ($required -notin $receiptProperties) { throw "ally_company_cycle_receipt_missing:$required" }
    }
    if ($Receipt.contract -ne $CeoCycleContract -or $Receipt.status -notin $allowedStatuses) {
        throw 'ally_company_cycle_receipt_contract_invalid'
    }
    if ($ExitCode -notin @(0, 2)) { throw 'ally_company_cycle_exit_invalid' }
    if (($ExitCode -eq 0) -ne [bool]$Receipt.ok) { throw 'ally_company_cycle_exit_status_mismatch' }
    if ($Execute -and $Receipt.status -eq 'ready') { throw 'ally_company_cycle_execution_not_performed' }
    if (-not $Execute -and $Receipt.status -notin @('ready', 'existing', 'existing_rejected', 'period_complete', 'period_incomplete')) {
        throw 'ally_company_cycle_preflight_mutation_detected'
    }
    if ($null -eq $Receipt.controls -or
        [bool]$Receipt.controls.externalWrites -or
        [int]$Receipt.controls.connectors -ne 0 -or
        [int]$Receipt.controls.maxLocalRuns -ne 1 -or
        -not [bool]$Receipt.controls.scaleToZero) {
        throw 'ally_company_cycle_controls_invalid'
    }
    if ($null -eq $Receipt.ownerBrief -or
        $Receipt.ownerBrief.contract -ne $OwnerBriefContract -or
        [int]$Receipt.ownerBrief.reviewBudgetMinutes -ne 10 -or
        $null -eq $Receipt.ownerBrief.controls -or
        -not [bool]$Receipt.ownerBrief.controls.codeOwned -or
        [bool]$Receipt.ownerBrief.controls.externalActionPerformed -or
        [int]$Receipt.ownerBrief.controls.connectorRequests -ne 0) {
        throw 'ally_company_cycle_owner_brief_invalid'
    }
    $resourceEnvelope = if ('resourceEnvelope' -in $receiptProperties) { $Receipt.resourceEnvelope } else { $null }
    if ($null -ne $resourceEnvelope) {
        if ([int]$resourceEnvelope.selectedAgents -ne 1 -or
            [int]$resourceEnvelope.maxConcurrentCycles -ne 1 -or
            [bool]$resourceEnvelope.externalWrites -or
            [int]$resourceEnvelope.connectorRequests -ne 0 -or
            [int]$resourceEnvelope.vercelActions -ne 0 -or
            [int]$resourceEnvelope.hostedSchedulerActions -ne 0 -or
            [bool]$resourceEnvelope.dynamicDelegation -or
            [bool]$resourceEnvelope.recursiveDelegation -or
            -not [bool]$resourceEnvelope.scaleToZero) {
            throw 'ally_company_cycle_resource_envelope_invalid'
        }
    }
    $modelCalls = [int]$Receipt.modelCalls
    $queueWrites = [int]$Receipt.queueWrites
    if ($modelCalls -lt 0 -or $modelCalls -gt 3 -or $queueWrites -lt 0 -or $queueWrites -gt 1) {
        throw 'ally_company_cycle_effect_budget_invalid'
    }
    $cycleStatus = switch ($Receipt.status) {
        'ready' { 'ready' }
        'accepted' { 'completed' }
        'existing' { 'completed_replay' }
        'period_complete' { 'idle' }
        'deferred' { 'deferred' }
        default { 'attention_required' }
    }
    [pscustomobject]@{
        contract = $Contract
        generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
        status = $cycleStatus
        ceoCycleStatus = [string]$Receipt.status
        period = if ('period' -in $receiptProperties) { $Receipt.period } else { $null }
        outcomeId = if ('outcomeId' -in $receiptProperties) { $Receipt.outcomeId } else { $null }
        completedOutcomeIds = @($Receipt.completedOutcomeIds)
        modelCalls = $modelCalls
        queueWrites = $queueWrites
        ownerBrief = $Receipt.ownerBrief
        localCycleLease = [ordered]@{
            contract = $LeaseContract
            mode = 'single_flight'
            releasePolicy = 'finally'
        }
        controls = [ordered]@{
            externalWrites = $false
            connectorRequests = 0
            vercelActions = 0
            hostedSchedulerActions = 0
            maxConcurrentLocalRuns = 1
            scaleToZero = $true
        }
    }
}

function Invoke-SelfTest {
    $ownerBrief = [pscustomobject]@{
        contract = $OwnerBriefContract
        reviewBudgetMinutes = 10
        controls = [pscustomobject]@{ codeOwned = $true; externalActionPerformed = $false; connectorRequests = 0 }
    }
    $controls = [pscustomobject]@{ externalWrites = $false; connectors = 0; maxLocalRuns = 1; scaleToZero = $true }
    $ready = [pscustomobject]@{
        ok = $true; contract = $CeoCycleContract; status = 'ready'; period = '2026-07-31'; outcomeId = 'daily-company-control'
        completedOutcomeIds = @(); modelCalls = 0; queueWrites = 0; ownerBrief = $ownerBrief; controls = $controls
        resourceEnvelope = [pscustomobject]@{
            selectedAgents = 1; maxConcurrentCycles = 1; externalWrites = $false; connectorRequests = 0
            vercelActions = 0; hostedSchedulerActions = 0; dynamicDelegation = $false; recursiveDelegation = $false; scaleToZero = $true
        }
    }
    $preflight = ConvertTo-CycleReport $ready 0 $false
    if ($preflight.status -ne 'ready' -or $preflight.modelCalls -ne 0) { throw 'ally_company_cycle_preflight_fixture_failed' }
    try { ConvertTo-CycleReport $ready 0 $true | Out-Null; throw 'fixture_should_reject' }
    catch { if ($_.Exception.Message -ne 'ally_company_cycle_execution_not_performed') { throw } }
    $complete = $ready.PSObject.Copy()
    $complete.status = 'accepted'; $complete.modelCalls = 2; $complete.queueWrites = 1
    $completed = ConvertTo-CycleReport $complete 0 $true
    if ($completed.status -ne 'completed' -or $completed.queueWrites -ne 1) { throw 'ally_company_cycle_execution_fixture_failed' }
    $attention = $ready.PSObject.Copy()
    $attention.ok = $false; $attention.status = 'period_incomplete'; $attention.outcomeId = $null
    $attended = ConvertTo-CycleReport $attention 2 $true
    if ($attended.status -ne 'attention_required') { throw 'ally_company_cycle_attention_fixture_failed' }
    $unsafe = $ready.PSObject.Copy()
    $unsafe.controls = [pscustomobject]@{ externalWrites = $true; connectors = 0; maxLocalRuns = 1; scaleToZero = $true }
    try { ConvertTo-CycleReport $unsafe 0 $false | Out-Null; throw 'fixture_should_reject' }
    catch { if ($_.Exception.Message -ne 'ally_company_cycle_controls_invalid') { throw } }
    $deferred = ConvertTo-DeferredCycle 'ally_ceo_local_cycle_model_unavailable'
    if ($deferred.status -ne 'deferred' -or $deferred.retryPolicy -ne 'next_scheduled_cycle') { throw 'ally_company_cycle_deferred_fixture_failed' }
    $scheduled = $ready.PSObject.Copy()
    $scheduled.status = 'deferred'
    $scheduled.ownerBrief = $ownerBrief
    $scheduledResult = ConvertTo-CycleReport $scheduled 0 $true
    if ($scheduledResult.status -ne 'deferred' -or $scheduledResult.modelCalls -ne 0) { throw 'ally_company_cycle_scheduled_fixture_failed' }
    $auditDeferred = ConvertTo-DeferredCycle 'ally_ceo_local_cycle_command_failed:audit:error'
    if ($auditDeferred.status -ne 'deferred' -or $auditDeferred.modelCalls -ne 0) { throw 'ally_company_cycle_audit_deferred_fixture_failed' }
    $wrapped = ConvertFrom-RunnerOutput @('node.exe : {"ok":false,"reason":"ally_ceo_local_cycle_model_unavailable"}', 'native error detail')
    if ([bool]$wrapped.ok -or $wrapped.reason -ne 'ally_ceo_local_cycle_model_unavailable') { throw 'ally_company_cycle_wrapped_json_fixture_failed' }
    try { ConvertTo-DeferredCycle 'unexpected_failure' | Out-Null; throw 'fixture_should_reject' }
    catch { if ($_.Exception.Message -ne 'ally_company_cycle_runner_failed:unexpected_failure') { throw } }
    $lease = Enter-LocalCycleLease $LeaseName
    try {
        try { Enter-LocalCycleLease $LeaseName | Out-Null; throw 'fixture_should_reject' }
        catch { if ($_.Exception.Message -ne 'ally_local_cycle_busy') { throw } }
    }
    finally { Exit-LocalCycleLease $lease }
    [pscustomobject]@{
        ok = $true
        contract = $Contract
        ceoCycleContract = $CeoCycleContract
        ownerBriefContract = $OwnerBriefContract
        leaseContract = $LeaseContract
        checks = 11
        networkRequests = 0
        processMutation = $false
        externalWrites = $false
    }
}

if ($SelfTest) {
    $result = Invoke-SelfTest
    if ($Json) { $result | ConvertTo-Json -Depth 6 -Compress } else { $result | Format-List }
    exit 0
}

if ($Scheduled -and ($Preflight -or $RecordResult)) {
    throw 'ally_company_cycle_scheduled_options_invalid'
}

$cycleLease = Enter-LocalCycleLease $LeaseName
try {
    $runner = Join-Path $PSScriptRoot 'run_ally_ceo_local_cycle.mjs'
    $nodeItem = Get-Item -LiteralPath $NodePath -ErrorAction Stop
    if (-not $nodeItem.PSIsContainer -and -not ($nodeItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        $trustedNode = $nodeItem.FullName
    }
    else { throw 'ally_company_cycle_node_untrusted' }
    $runnerArguments = @($runner)
    if ($Scheduled) {
        $runnerArguments += @('--execute', '--refresh-knowledge', '--scheduled', '--record-result')
    }
    elseif (-not $Preflight) { $runnerArguments += @('--execute', '--refresh-knowledge') }
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $runnerOutput = @(& $trustedNode @runnerArguments 2>&1 | ForEach-Object { [string]$_ })
        $runnerExit = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $previousErrorActionPreference }
    $receipt = ConvertFrom-RunnerOutput $runnerOutput
    $hasReason = $receipt.PSObject.Properties.Name -contains 'reason'
    $hasContract = $receipt.PSObject.Properties.Name -contains 'contract'
    if ($hasReason -and (-not $hasContract -or $receipt.contract -ne $CeoCycleContract)) {
        $report = ConvertTo-DeferredCycle ([string]$receipt.reason)
    }
    else {
        $report = ConvertTo-CycleReport $receipt $runnerExit (-not $Preflight)
    }
    if ($RecordResult) { Save-CycleReceipt $report | Out-Null }
    if ($Json) { $report | ConvertTo-Json -Depth 10 -Compress }
    else {
        "SuperMega local CEO cycle: $($report.status)."
        if ($null -ne $report.ownerBrief) { $report.ownerBrief.headline }
        'One local cycle maximum; external actions remain unavailable.'
    }
}
finally {
    Exit-LocalCycleLease $cycleLease
}

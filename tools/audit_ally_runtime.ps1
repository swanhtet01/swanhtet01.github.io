[CmdletBinding()]
param(
    [switch]$Json,
    [switch]$SelfTest,
    [switch]$FailOnWarning,
    [ValidateRange(50, 99)]
    [int]$MemoryWarningPercent = 80,
    [ValidateRange(51, 99)]
    [int]$MemoryBlockPercent = 85,
    [ValidateRange(256, 16384)]
    [int]$CodexWorkingSetWarningMb = 2500
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Contract = 'supermega.ally-runtime-audit.v1'
$HostAdmissionContract = 'supermega.ally-host-admission.v1'
$LocalCompanyHealthContract = 'local-company.health.v1'
$CodexSubagentPolicyContract = 'supermega.codex-subagent-policy.v1'
$MaxLocalCompanyHealthBytes = 65536
$MaxCodexConfigBytes = 262144
$RepoMarker = 'supermega-platform'
$BackendPorts = @(8000, 8001, 8788)

function Get-ListenerRole {
    param([int]$Port)
    if (($Port -ge 4173 -and $Port -le 4199) -or ($Port -ge 5173 -and $Port -le 5199)) { return 'frontend' }
    if ($BackendPorts -contains $Port) { return 'backend' }
    if ($Port -eq 8765) { return 'worker' }
    return ''
}

function ConvertTo-CodexSubagentPolicy {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text) -or [System.Text.Encoding]::UTF8.GetByteCount($Text) -gt $MaxCodexConfigBytes) {
        throw 'codex_subagent_policy_config_invalid'
    }
    $featureSections = 0
    $multiAgentDeclarations = [System.Collections.Generic.List[bool]]::new()
    $insideFeatures = $false
    foreach ($line in ($Text -split "`r?`n")) {
        if ($line -match '^\s*\[([^\]]+)\]\s*(?:#.*)?$') {
            $insideFeatures = $Matches[1].Trim() -ceq 'features'
            if ($insideFeatures) { $featureSections += 1 }
            continue
        }
        if (-not $insideFeatures -or $line -match '^\s*(?:#|$)') { continue }
        if ($line -match '^\s*multi_agent\s*=\s*(true|false)\s*(?:#.*)?$') {
            $multiAgentDeclarations.Add($Matches[1] -ceq 'true')
            continue
        }
        if ($line -match '^\s*multi_agent\s*=') { throw 'codex_subagent_policy_value_invalid' }
    }
    if ($featureSections -ne 1 -or $multiAgentDeclarations.Count -ne 1) { throw 'codex_subagent_policy_declaration_invalid' }
    $enabled = [bool]$multiAgentDeclarations[0]
    [pscustomobject]@{
        contract = $CodexSubagentPolicyContract
        verified = $true
        source = 'local_codex_config'
        multiAgentEnabled = $enabled
        configuredMaxLocalSubagents = if ($enabled) { $null } else { 0 }
    }
}

function Get-CodexSubagentPolicy {
    $profileRoot = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
    if ([string]::IsNullOrWhiteSpace($profileRoot)) { throw 'codex_subagent_policy_profile_unavailable' }
    $configPath = [System.IO.Path]::GetFullPath((Join-Path $profileRoot '.codex\config.toml'))
    $item = Get-Item -LiteralPath $configPath -ErrorAction Stop
    if (-not $item.PSIsContainer -and ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0 -and $item.Length -gt 0 -and $item.Length -le $MaxCodexConfigBytes) {
        $encoding = [System.Text.UTF8Encoding]::new($false, $true)
        return ConvertTo-CodexSubagentPolicy ($encoding.GetString([System.IO.File]::ReadAllBytes($configPath)))
    }
    throw 'codex_subagent_policy_file_invalid'
}

function Get-BoundedHealthCount {
    param(
        [object]$Value,
        [string]$Field
    )
    if ($Value -isnot [int] -and $Value -isnot [long]) { throw "local_company_health_$($Field)_invalid" }
    $count = [long]$Value
    if ($count -lt 0 -or $count -gt 1000000) { throw "local_company_health_$($Field)_invalid" }
    return $count
}

function ConvertTo-LocalCompanyHealthSummary {
    param(
        [pscustomobject]$Payload,
        [int]$ExpectedProcessId
    )
    if ($null -eq $Payload -or [string]$Payload.schema -ne $LocalCompanyHealthContract) { throw 'local_company_health_contract_invalid' }
    if ([string]$Payload.status -ne 'ready') { throw 'local_company_health_status_invalid' }
    if ($Payload.pid -isnot [int] -and $Payload.pid -isnot [long]) { throw 'local_company_health_pid_invalid' }
    if ([int]$Payload.pid -ne $ExpectedProcessId) { throw 'local_company_health_pid_mismatch' }
    if ($null -eq $Payload.health -or $null -eq $Payload.worker) { throw 'local_company_health_shape_invalid' }
    $workerStatus = [string]$Payload.worker.status
    if ($workerStatus -notin @('idle', 'running', 'starting', 'stopping', 'failed', 'disabled')) { throw 'local_company_worker_status_invalid' }
    [pscustomobject]@{
        contract = $LocalCompanyHealthContract
        activeJobs = Get-BoundedHealthCount $Payload.health.active_jobs 'active_jobs'
        queuedMissions = Get-BoundedHealthCount $Payload.health.queued_missions 'queued_missions'
        runningMissions = Get-BoundedHealthCount $Payload.health.running_missions 'running_missions'
        pendingApprovals = Get-BoundedHealthCount $Payload.health.pending_approvals 'pending_approvals'
        pendingReportFinalizations = Get-BoundedHealthCount $Payload.health.pending_report_finalizations 'pending_report_finalizations'
        pendingEvaluations = Get-BoundedHealthCount $Payload.health.pending_evaluations 'pending_evaluations'
        workerStatus = $workerStatus
    }
}

function Get-LocalCompanyHealthPayload {
    $request = [System.Net.HttpWebRequest]::Create('http://127.0.0.1:8765/health.json')
    $request.Method = 'GET'
    $request.Accept = 'application/json'
    $request.AllowAutoRedirect = $false
    $request.Proxy = $null
    $request.Timeout = 2000
    $request.ReadWriteTimeout = 2000
    $response = $request.GetResponse()
    try {
        if ($response.StatusCode -ne [System.Net.HttpStatusCode]::OK) { throw 'local_company_health_http_invalid' }
        if ([string]$response.ContentType -notmatch '^application/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)') { throw 'local_company_health_content_type_invalid' }
        if ($response.ContentLength -gt $MaxLocalCompanyHealthBytes) { throw 'local_company_health_too_large' }
        $stream = $response.GetResponseStream()
        $memory = [System.IO.MemoryStream]::new()
        try {
            $buffer = [byte[]]::new(4096)
            while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                if ($memory.Length + $read -gt $MaxLocalCompanyHealthBytes) { throw 'local_company_health_too_large' }
                $memory.Write($buffer, 0, $read)
            }
            $text = [System.Text.Encoding]::UTF8.GetString($memory.ToArray())
        }
        finally {
            $stream.Dispose()
            $memory.Dispose()
        }
    }
    finally { $response.Dispose() }
    try { return $text | ConvertFrom-Json }
    catch { throw 'local_company_health_json_invalid' }
}

function Get-AuditFindings {
    param(
        [double]$UsedMemoryPercent,
        [double]$CodexWorkingSetMb,
        [int]$LoadedModelCount,
        [pscustomobject]$ListenerSummary,
        [bool]$ListenerInventoryAvailable,
        [pscustomobject]$LocalCompanySummary = $null,
        [bool]$LocalCompanyHealthRequired = $false,
        [bool]$LocalCompanyHealthAvailable = $false,
        [pscustomobject]$CodexSubagentPolicy = $null
    )
    $findings = [System.Collections.Generic.List[object]]::new()
    if ($UsedMemoryPercent -ge $MemoryWarningPercent) {
        $findings.Add([pscustomobject]@{ code = 'memory_pressure'; severity = 'warning'; detail = "RAM use is $UsedMemoryPercent percent." })
    }
    if ($UsedMemoryPercent -ge $MemoryBlockPercent) {
        $findings.Add([pscustomobject]@{ code = 'memory_pressure_critical'; severity = 'blocker'; detail = "RAM use is $UsedMemoryPercent percent; local company dispatch is paused." })
    }
    if ($CodexWorkingSetMb -ge $CodexWorkingSetWarningMb) {
        $findings.Add([pscustomobject]@{ code = 'codex_working_set_high'; severity = 'warning'; detail = "Codex resident memory is $CodexWorkingSetMb MB." })
    }
    if ($LoadedModelCount -gt 0) {
        $findings.Add([pscustomobject]@{ code = 'local_models_loaded'; severity = 'warning'; detail = "$LoadedModelCount Ollama model(s) are resident." })
    }
    if (-not $ListenerInventoryAvailable) {
        $findings.Add([pscustomobject]@{ code = 'listener_inventory_unavailable'; severity = 'warning'; detail = 'Listener ownership could not be verified.' })
    }
    if ($ListenerSummary.frontends -gt 1) {
        $findings.Add([pscustomobject]@{ code = 'duplicate_frontend_listeners'; severity = 'warning'; detail = "$($ListenerSummary.frontends) owned frontend listeners were found." })
    }
    if ($ListenerSummary.backends -gt 1) {
        $findings.Add([pscustomobject]@{ code = 'duplicate_backend_listeners'; severity = 'warning'; detail = "$($ListenerSummary.backends) owned backend listeners were found." })
    }
    if ($ListenerSummary.workers -gt 1) {
        $findings.Add([pscustomobject]@{ code = 'duplicate_local_workers'; severity = 'warning'; detail = "$($ListenerSummary.workers) local worker listeners were found." })
    }
    if ($ListenerSummary.ambiguous -gt 0) {
        $findings.Add([pscustomobject]@{ code = 'ambiguous_listener_ownership'; severity = 'warning'; detail = "$($ListenerSummary.ambiguous) relevant listener(s) have ambiguous ownership." })
    }
    if ($LocalCompanyHealthRequired -and -not $LocalCompanyHealthAvailable) {
        $findings.Add([pscustomobject]@{ code = 'local_company_health_unavailable'; severity = 'blocker'; detail = 'The local company worker is present but its bounded health state could not be verified.' })
    }
    if ($LocalCompanyHealthAvailable) {
        $activeWork = [long]$LocalCompanySummary.activeJobs + [long]$LocalCompanySummary.runningMissions + [long]$LocalCompanySummary.pendingReportFinalizations + [long]$LocalCompanySummary.pendingEvaluations
        if ($activeWork -gt 0 -or [string]$LocalCompanySummary.workerStatus -ne 'idle') {
            $findings.Add([pscustomobject]@{ code = 'local_company_work_active'; severity = 'blocker'; detail = 'The local company already has active or transitional work; another company cycle is paused.' })
        }
    }
    if ($null -ne $CodexSubagentPolicy) {
        if ($CodexSubagentPolicy.contract -ne $CodexSubagentPolicyContract -or $CodexSubagentPolicy.verified -ne $true) {
            $findings.Add([pscustomobject]@{ code = 'codex_subagent_policy_unverified'; severity = 'blocker'; detail = 'The local Codex zero-subagent policy could not be verified.' })
        }
        elseif ($CodexSubagentPolicy.multiAgentEnabled -ne $false -or $CodexSubagentPolicy.configuredMaxLocalSubagents -ne 0) {
            $findings.Add([pscustomobject]@{ code = 'codex_multi_agent_enabled'; severity = 'blocker'; detail = 'Codex multi-agent execution is enabled; local company dispatch is paused.' })
        }
    }
    return @($findings)
}

function Get-HostAdmission {
    param([object[]]$Findings)
    $blockingCodes = @(
        'memory_pressure_critical',
        'codex_working_set_high',
        'local_models_loaded',
        'listener_inventory_unavailable',
        'duplicate_frontend_listeners',
        'duplicate_backend_listeners',
        'duplicate_local_workers',
        'ambiguous_listener_ownership',
        'local_company_health_unavailable',
        'local_company_work_active',
        'codex_subagent_policy_unverified',
        'codex_multi_agent_enabled'
    )
    $blockers = @($Findings | Where-Object { $blockingCodes -contains [string]$_.code } | ForEach-Object { [string]$_.code })
    [pscustomobject]@{
        contract = $HostAdmissionContract
        eligible = $blockers.Count -eq 0
        maxConcurrentLocalRuns = if ($blockers.Count -eq 0) { 1 } else { 0 }
        blockers = $blockers
    }
}

function Invoke-SelfTest {
    if ($MemoryBlockPercent -le $MemoryWarningPercent) { throw 'memory_threshold_order_invalid' }
    $empty = [pscustomobject]@{ frontends = 1; backends = 1; workers = 1; ambiguous = 0 }
    $healthyFindings = @(Get-AuditFindings 50 500 0 $empty $true)
    if ($healthyFindings.Count -ne 0) { throw 'healthy_fixture_failed' }
    if (-not (Get-AuditFindings 90 500 0 $empty $true | Where-Object code -eq 'memory_pressure')) { throw 'memory_fixture_failed' }
    $duplicate = [pscustomobject]@{ frontends = 2; backends = 1; workers = 2; ambiguous = 1 }
    $codes = @(Get-AuditFindings 50 500 0 $duplicate $true | ForEach-Object code)
    foreach ($code in @('duplicate_frontend_listeners', 'duplicate_local_workers', 'ambiguous_listener_ownership')) {
        if ($codes -notcontains $code) { throw "missing_fixture_$code" }
    }
    $healthyAdmission = Get-HostAdmission $healthyFindings
    if (-not $healthyAdmission.eligible -or $healthyAdmission.maxConcurrentLocalRuns -ne 1) { throw 'healthy_admission_failed' }
    $warningAdmission = Get-HostAdmission @(Get-AuditFindings 82 500 0 $empty $true)
    if (-not $warningAdmission.eligible -or $warningAdmission.maxConcurrentLocalRuns -ne 1) { throw 'warning_admission_failed' }
    $blockedAdmission = Get-HostAdmission @(Get-AuditFindings 90 500 0 $empty $true)
    if ($blockedAdmission.eligible -or $blockedAdmission.maxConcurrentLocalRuns -ne 0 -or $blockedAdmission.blockers -notcontains 'memory_pressure_critical') { throw 'blocked_admission_failed' }
    $healthFixture = [pscustomobject]@{
        schema = $LocalCompanyHealthContract
        status = 'ready'
        pid = 123
        health = [pscustomobject]@{ active_jobs = 0; queued_missions = 4; running_missions = 0; pending_approvals = 2; pending_report_finalizations = 0; pending_evaluations = 0 }
        worker = [pscustomobject]@{ status = 'idle' }
    }
    $healthSummary = ConvertTo-LocalCompanyHealthSummary $healthFixture 123
    if ($healthSummary.queuedMissions -ne 4 -or $healthSummary.pendingApprovals -ne 2 -or $healthSummary.workerStatus -ne 'idle') { throw 'local_company_health_fixture_failed' }
    $busySummary = [pscustomobject]@{ activeJobs = 1; runningMissions = 1; pendingReportFinalizations = 0; pendingEvaluations = 0; workerStatus = 'running' }
    $busyFindings = @(Get-AuditFindings 50 500 0 $empty $true $busySummary $true $true)
    if ($busyFindings.code -notcontains 'local_company_work_active' -or (Get-HostAdmission $busyFindings).eligible) { throw 'local_company_busy_fixture_failed' }
    $missingFindings = @(Get-AuditFindings 50 500 0 $empty $true $null $true $false)
    if ($missingFindings.code -notcontains 'local_company_health_unavailable' -or (Get-HostAdmission $missingFindings).eligible) { throw 'local_company_missing_fixture_failed' }
    try { ConvertTo-LocalCompanyHealthSummary $healthFixture 124 | Out-Null; throw 'fixture_should_reject' }
    catch { if ($_.Exception.Message -ne 'local_company_health_pid_mismatch') { throw } }
    $disabledPolicy = ConvertTo-CodexSubagentPolicy "[features]`nmulti_agent = false # local-only`n"
    if (-not $disabledPolicy.verified -or $disabledPolicy.multiAgentEnabled -or $disabledPolicy.configuredMaxLocalSubagents -ne 0) { throw 'codex_subagent_disabled_fixture_failed' }
    $enabledPolicy = ConvertTo-CodexSubagentPolicy "[features]`nmulti_agent = true`n"
    $enabledFindings = @(Get-AuditFindings 50 500 0 $empty $true $null $false $false $enabledPolicy)
    if ($enabledFindings.code -notcontains 'codex_multi_agent_enabled' -or (Get-HostAdmission $enabledFindings).eligible) { throw 'codex_subagent_enabled_fixture_failed' }
    foreach ($invalid in @(
        "# multi_agent = false`n[features]`nother = true`n",
        "[features]`nmulti_agent = false`n[features]`nmulti_agent = false`n",
        "[features]`nmulti_agent = 0`n"
    )) {
        try { ConvertTo-CodexSubagentPolicy $invalid | Out-Null; throw 'fixture_should_reject' }
        catch { if ($_.Exception.Message -eq 'fixture_should_reject') { throw } }
    }
    $unverifiedPolicy = [pscustomobject]@{ contract = $CodexSubagentPolicyContract; verified = $false; multiAgentEnabled = $null; configuredMaxLocalSubagents = $null }
    $unverifiedFindings = @(Get-AuditFindings 50 500 0 $empty $true $null $false $false $unverifiedPolicy)
    if ($unverifiedFindings.code -notcontains 'codex_subagent_policy_unverified' -or (Get-HostAdmission $unverifiedFindings).eligible) { throw 'codex_subagent_unverified_fixture_failed' }
    if ((Get-ListenerRole 5173) -ne 'frontend' -or (Get-ListenerRole 4187) -ne 'frontend') { throw 'frontend_port_fixture_failed' }
    if ((Get-ListenerRole 8788) -ne 'backend' -or (Get-ListenerRole 8000) -ne 'backend') { throw 'backend_port_fixture_failed' }
    if ((Get-ListenerRole 8765) -ne 'worker' -or (Get-ListenerRole 11434) -ne '') { throw 'worker_port_fixture_failed' }
    [pscustomobject]@{ ok = $true; contract = $Contract; hostAdmissionContract = $HostAdmissionContract; localCompanyHealthContract = $LocalCompanyHealthContract; codexSubagentPolicyContract = $CodexSubagentPolicyContract; checks = 21; processMutation = $false }
}

if ($SelfTest) {
    $selfTestResult = Invoke-SelfTest
    if ($Json) { $selfTestResult | ConvertTo-Json -Depth 4 -Compress } else { $selfTestResult | Format-List }
    exit 0
}

$processRows = @(Get-CimInstance Win32_Process -ErrorAction Stop)
$processMap = @{}
foreach ($row in $processRows) { $processMap[[int]$row.ProcessId] = $row }

function Test-Lineage {
    param(
        [int]$ProcessKey,
        [scriptblock]$Predicate
    )
    $seen = @{}
    $current = $ProcessKey
    while ($current -gt 0 -and -not $seen.ContainsKey($current)) {
        $seen[$current] = $true
        $row = $processMap[$current]
        if (-not $row) { break }
        if (& $Predicate $row) { return $true }
        $current = [int]$row.ParentProcessId
    }
    return $false
}

$codexRows = @($processRows | Where-Object {
    Test-Lineage ([int]$_.ProcessId) {
        param($candidate)
        $candidate.Name -eq 'ChatGPT.exe' -and [string]$candidate.ExecutablePath -like '*OpenAI.Codex_*'
    }
})
$codexWorkingSetMb = [math]::Round((($codexRows | Measure-Object WorkingSetSize -Sum).Sum / 1MB), 1)
$renderers = @($codexRows | Where-Object { $_.Name -eq 'ChatGPT.exe' -and [string]$_.CommandLine -match '--type=renderer' })
$rendererWorkingSetMb = [math]::Round((($renderers | Measure-Object WorkingSetSize -Sum).Sum / 1MB), 1)
$helpers = @($codexRows | Where-Object { $_.Name -in @('codex.exe', 'node.exe', 'node_repl.exe', 'powershell.exe', 'conhost.exe') })
$activeHelpers = @($helpers | Where-Object { [double]$_.WorkingSetSize -ge 5MB })
$helperWorkingSetMb = [math]::Round((($helpers | Measure-Object WorkingSetSize -Sum).Sum / 1MB), 1)
$codexSubagentPolicy = $null
try { $codexSubagentPolicy = Get-CodexSubagentPolicy }
catch {
    $codexSubagentPolicy = [pscustomobject]@{
        contract = $CodexSubagentPolicyContract
        verified = $false
        source = 'local_codex_config'
        multiAgentEnabled = $null
        configuredMaxLocalSubagents = $null
    }
}

$os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
$totalMemoryGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
$freeMemoryGb = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
$usedMemoryPercent = [math]::Round((1 - ($os.FreePhysicalMemory / $os.TotalVisibleMemorySize)) * 100, 1)

$ollamaAvailable = $false
$loadedModelCount = 0
try {
    $ollama = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/ps' -Method Get -TimeoutSec 2
    $ollamaAvailable = $true
    $loadedModelCount = @($ollama.models).Count
} catch {
    $ollamaAvailable = $false
}

$listenerInventoryAvailable = $true
$listenerRecords = [System.Collections.Generic.List[object]]::new()
try {
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop)
    foreach ($listener in $listeners) {
        $port = [int]$listener.LocalPort
        $role = Get-ListenerRole $port
        if (-not $role) { continue }
        $owner = $processMap[[int]$listener.OwningProcess]
        $owned = if ($role -eq 'worker') {
            Test-Lineage ([int]$listener.OwningProcess) { param($candidate) [string]$candidate.CommandLine -match 'local_company\.cli' }
        } else {
            Test-Lineage ([int]$listener.OwningProcess) { param($candidate) [string]$candidate.CommandLine -match $RepoMarker }
        }
        $listenerRecords.Add([pscustomobject]@{
            role = $role
            port = $port
            processId = [int]$listener.OwningProcess
            process = if ($owner) { [string]$owner.Name } else { 'unknown' }
            ownership = if ($owned) { 'owned' } else { 'ambiguous' }
        })
    }
} catch {
    $listenerInventoryAvailable = $false
}

$listenerSummary = [pscustomobject]@{
    frontends = @($listenerRecords | Where-Object { $_.role -eq 'frontend' -and $_.ownership -eq 'owned' }).Count
    backends = @($listenerRecords | Where-Object { $_.role -eq 'backend' -and $_.ownership -eq 'owned' }).Count
    workers = @($listenerRecords | Where-Object { $_.role -eq 'worker' -and $_.ownership -eq 'owned' }).Count
    ambiguous = @($listenerRecords | Where-Object ownership -eq 'ambiguous').Count
}
$localCompanyHealthRequired = $listenerSummary.workers -eq 1 -and $listenerSummary.ambiguous -eq 0
$localCompanyHealthAvailable = $false
$localCompanySummary = $null
if ($localCompanyHealthRequired) {
    $workerListener = @($listenerRecords | Where-Object { $_.role -eq 'worker' -and $_.ownership -eq 'owned' })[0]
    try {
        $localCompanySummary = ConvertTo-LocalCompanyHealthSummary (Get-LocalCompanyHealthPayload) ([int]$workerListener.processId)
        $localCompanyHealthAvailable = $true
    }
    catch {
        $localCompanyHealthAvailable = $false
        $localCompanySummary = $null
    }
}
$findings = @(Get-AuditFindings $usedMemoryPercent $codexWorkingSetMb $loadedModelCount $listenerSummary $listenerInventoryAvailable $localCompanySummary $localCompanyHealthRequired $localCompanyHealthAvailable $codexSubagentPolicy)
$hostAdmission = Get-HostAdmission $findings
$report = [ordered]@{
    ok = $findings.Count -eq 0
    contract = $Contract
    mode = 'read_only'
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    memory = [ordered]@{
        totalGb = $totalMemoryGb
        freeGb = $freeMemoryGb
        usedPercent = $usedMemoryPercent
    }
    codex = [ordered]@{
        processCount = $codexRows.Count
        workingSetMb = $codexWorkingSetMb
        rendererCount = $renderers.Count
        rendererWorkingSetMb = $rendererWorkingSetMb
        helperCount = $helpers.Count
        activeHelperCount = $activeHelpers.Count
        helperWorkingSetMb = $helperWorkingSetMb
        subagentCount = $null
        subagentObservation = 'runtime_count_not_os_observable'
        subagentPolicy = [ordered]@{
            contract = $codexSubagentPolicy.contract
            verified = $codexSubagentPolicy.verified
            source = $codexSubagentPolicy.source
            multiAgentEnabled = $codexSubagentPolicy.multiAgentEnabled
            configuredMaxLocalSubagents = $codexSubagentPolicy.configuredMaxLocalSubagents
        }
    }
    localModels = [ordered]@{
        serviceAvailable = $ollamaAvailable
        loaded = $loadedModelCount
    }
    listeners = [ordered]@{
        inventoryAvailable = $listenerInventoryAvailable
        frontends = $listenerSummary.frontends
        backends = $listenerSummary.backends
        workers = $listenerSummary.workers
        ambiguous = $listenerSummary.ambiguous
        records = @($listenerRecords)
    }
    localCompany = [ordered]@{
        contract = $LocalCompanyHealthContract
        healthRequired = $localCompanyHealthRequired
        healthAvailable = $localCompanyHealthAvailable
        activeJobs = if ($localCompanyHealthAvailable) { $localCompanySummary.activeJobs } else { $null }
        queuedMissions = if ($localCompanyHealthAvailable) { $localCompanySummary.queuedMissions } else { $null }
        runningMissions = if ($localCompanyHealthAvailable) { $localCompanySummary.runningMissions } else { $null }
        pendingApprovals = if ($localCompanyHealthAvailable) { $localCompanySummary.pendingApprovals } else { $null }
        pendingReportFinalizations = if ($localCompanyHealthAvailable) { $localCompanySummary.pendingReportFinalizations } else { $null }
        pendingEvaluations = if ($localCompanyHealthAvailable) { $localCompanySummary.pendingEvaluations } else { $null }
        workerStatus = if ($localCompanyHealthAvailable) { $localCompanySummary.workerStatus } else { 'unavailable' }
    }
    findings = $findings
    hostAdmission = $hostAdmission
    controls = [ordered]@{
        processMutation = $false
        commandLinesInspectedForOwnership = $true
        commandLinesReturned = $false
        secretValuesReturned = $false
        environmentRead = $false
        codexConfigRead = $true
        codexConfigPathReturned = $false
        codexConfigMaxBytes = $MaxCodexConfigBytes
        loopbackHealthRead = $true
        loopbackHealthMaxBytes = $MaxLocalCompanyHealthBytes
        automaticCleanup = $false
    }
}

if ($Json) {
    $report | ConvertTo-Json -Depth 7 -Compress
} else {
    "Ally runtime: $($report.memory.usedPercent)% RAM used; $($report.codex.workingSetMb) MB Codex; $($report.localModels.loaded) loaded model(s)."
    "Listeners: $($report.listeners.frontends) frontend, $($report.listeners.backends) backend, $($report.listeners.workers) worker, $($report.listeners.ambiguous) ambiguous."
    "Local company admission: $(if ($report.hostAdmission.eligible) { 'ready (maximum one run)' } else { 'blocked' })."
    if ($findings.Count) { $findings | Format-Table code, severity, detail -AutoSize } else { 'No runtime findings.' }
}

if ($FailOnWarning -and $findings.Count) { exit 2 }
exit 0

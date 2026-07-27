[CmdletBinding()]
param(
    [switch]$Json,
    [switch]$SelfTest,
    [switch]$FailOnWarning,
    [ValidateRange(50, 99)]
    [int]$MemoryWarningPercent = 80,
    [ValidateRange(256, 16384)]
    [int]$CodexWorkingSetWarningMb = 2500
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Contract = 'supermega.ally-runtime-audit.v1'
$RepoMarker = 'supermega-platform'

function Get-AuditFindings {
    param(
        [double]$UsedMemoryPercent,
        [double]$CodexWorkingSetMb,
        [int]$LoadedModelCount,
        [pscustomobject]$ListenerSummary,
        [bool]$ListenerInventoryAvailable
    )
    $findings = [System.Collections.Generic.List[object]]::new()
    if ($UsedMemoryPercent -ge $MemoryWarningPercent) {
        $findings.Add([pscustomobject]@{ code = 'memory_pressure'; severity = 'warning'; detail = "RAM use is $UsedMemoryPercent percent." })
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
    return @($findings)
}

function Invoke-SelfTest {
    $empty = [pscustomobject]@{ frontends = 1; backends = 1; workers = 1; ambiguous = 0 }
    $healthyFindings = @(Get-AuditFindings 50 500 0 $empty $true)
    if ($healthyFindings.Count -ne 0) { throw 'healthy_fixture_failed' }
    if (-not (Get-AuditFindings 90 500 0 $empty $true | Where-Object code -eq 'memory_pressure')) { throw 'memory_fixture_failed' }
    $duplicate = [pscustomobject]@{ frontends = 2; backends = 1; workers = 2; ambiguous = 1 }
    $codes = @(Get-AuditFindings 50 500 0 $duplicate $true | ForEach-Object code)
    foreach ($code in @('duplicate_frontend_listeners', 'duplicate_local_workers', 'ambiguous_listener_ownership')) {
        if ($codes -notcontains $code) { throw "missing_fixture_$code" }
    }
    [pscustomobject]@{ ok = $true; contract = $Contract; checks = 4; processMutation = $false }
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
        $role = if ($port -ge 4173 -and $port -le 4199) { 'frontend' }
            elseif ($port -in @(8000, 8001)) { 'backend' }
            elseif ($port -eq 8765) { 'worker' }
            else { '' }
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
$findings = @(Get-AuditFindings $usedMemoryPercent $codexWorkingSetMb $loadedModelCount $listenerSummary $listenerInventoryAvailable)
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
        subagentObservation = 'not_os_observable'
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
    findings = $findings
    controls = [ordered]@{
        processMutation = $false
        commandLinesInspectedForOwnership = $true
        commandLinesReturned = $false
        secretValuesReturned = $false
        environmentRead = $false
        automaticCleanup = $false
    }
}

if ($Json) {
    $report | ConvertTo-Json -Depth 7 -Compress
} else {
    "Ally runtime: $($report.memory.usedPercent)% RAM used; $($report.codex.workingSetMb) MB Codex; $($report.localModels.loaded) loaded model(s)."
    "Listeners: $($report.listeners.frontends) frontend, $($report.listeners.backends) backend, $($report.listeners.workers) worker, $($report.listeners.ambiguous) ambiguous."
    if ($findings.Count) { $findings | Format-Table code, severity, detail -AutoSize } else { 'No runtime findings.' }
}

if ($FailOnWarning -and $findings.Count) { exit 2 }
exit 0

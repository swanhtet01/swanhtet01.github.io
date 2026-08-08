[CmdletBinding()]
param(
    [ValidateSet('Install', 'Status', 'Remove', 'Repair')]
    [string]$Mode = 'Status',
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Contract = 'supermega.ally-ceo-task.v1'
$CycleContract = 'supermega.ally-ceo-local-cycle.v1'
$TaskName = 'SuperMega Ally CEO Cycle'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$StateRoot = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $Root) 'supermega-local-company-state'))
$ReceiptPath = Join-Path $StateRoot 'ally-ceo-cycle-last.json'
$PowerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$Node = 'C:\Users\thesw\tools\node-v24.18.0-win-x64\node.exe'
$Interval = 'PT6H'
$MaxReceiptBytes = 64 * 1024
$MutationCommitted = $false

$PinnedFiles = [ordered]@{
    wrapper = Join-Path $Root 'tools\invoke_supermega_company_cycle.ps1'
    runner = Join-Path $Root 'tools\run_ally_ceo_local_cycle.mjs'
    planner = Join-Path $Root 'kernel\ally-ceo-company-plan.mjs'
    audit = Join-Path $Root 'tools\audit_ally_runtime.ps1'
    trim = Join-Path $Root 'tools\trim_codex_working_sets.ps1'
    live = Join-Path $Root 'tools\verify_hq_live_state.mjs'
    package = Join-Path $Root 'package.json'
    node = $Node
}

foreach ($entry in $PinnedFiles.GetEnumerator()) {
    if (-not (Test-Path -LiteralPath $entry.Value -PathType Leaf)) {
        throw "ally_ceo_task_source_missing:$($entry.Key)"
    }
}

$PinnedDigests = [ordered]@{}
foreach ($entry in $PinnedFiles.GetEnumerator()) {
    $PinnedDigests[$entry.Key] = (
        Get-FileHash -LiteralPath $entry.Value -Algorithm SHA256
    ).Hash.ToLowerInvariant()
}

function ConvertTo-SingleQuotedLiteral([string]$Value) {
    return "'" + $Value.Replace("'", "''") + "'"
}

$GuardLines = [Collections.Generic.List[string]]::new()
$GuardLines.Add("`$ErrorActionPreference = 'Stop'")
$GuardLines.Add("`$wrapper = $(ConvertTo-SingleQuotedLiteral $PinnedFiles['wrapper'])")
$ExitCode = 90
foreach ($entry in $PinnedFiles.GetEnumerator()) {
    $literal = ConvertTo-SingleQuotedLiteral $entry.Value
    $digest = $PinnedDigests[$entry.Key]
    $GuardLines.Add(
        "if ((Get-FileHash -LiteralPath $literal -Algorithm SHA256).Hash.ToLowerInvariant() -ne '$digest') { exit $ExitCode }"
    )
    $ExitCode += 1
}
$GuardLines.Add("& `$wrapper -Scheduled -Json")
$GuardLines.Add('exit $LASTEXITCODE')
$GuardCommand = $GuardLines -join "`r`n"
$EncodedGuard = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($GuardCommand))
$Arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ' + $EncodedGuard

function Get-CeoTask {
    return Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

function Test-CeoTaskPolicy([object]$Task) {
    if ($null -eq $Task) { return $false }
    $actions = @($Task.Actions)
    $triggers = @($Task.Triggers)
    if ($actions.Count -ne 1 -or $triggers.Count -ne 1) { return $false }
    $action = $actions[0]
    $trigger = $triggers[0]
    return (
        [string]::Equals([string]$action.Execute, $PowerShell, [StringComparison]::OrdinalIgnoreCase) -and
        [string]::Equals([string]$action.WorkingDirectory, $Root, [StringComparison]::OrdinalIgnoreCase) -and
        [string]::Equals([string]$trigger.Repetition.Interval, $Interval, [StringComparison]::Ordinal) -and
        [string]::Equals([string]$Task.Principal.LogonType, 'Interactive', [StringComparison]::OrdinalIgnoreCase) -and
        [string]::Equals([string]$Task.Principal.RunLevel, 'Limited', [StringComparison]::OrdinalIgnoreCase) -and
        [string]::Equals([string]$Task.Settings.MultipleInstances, 'IgnoreNew', [StringComparison]::OrdinalIgnoreCase) -and
        $Task.Settings.ExecutionTimeLimit -eq 'PT2H' -and
        $Task.Settings.RunOnlyIfIdle -and
        $Task.Settings.IdleSettings.IdleDuration -eq 'PT10M' -and
        $Task.Settings.IdleSettings.WaitTimeout -eq 'PT6H' -and
        -not $Task.Settings.IdleSettings.StopOnIdleEnd -and
        $Task.Settings.Enabled
    )
}

function Test-CeoTask([object]$Task) {
    if (-not (Test-CeoTaskPolicy $Task)) { return $false }
    $action = @($Task.Actions)[0]
    return [string]::Equals(
        [string]$action.Arguments,
        $Arguments,
        [StringComparison]::Ordinal
    )
}

function Test-CeoTaskRepairable([object]$Task) {
    if (-not (Test-CeoTaskPolicy $Task)) { return $false }
    $prefix = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand '
    $action = @($Task.Actions)[0]
    $actualArguments = [string]$action.Arguments
    if (-not $actualArguments.StartsWith($prefix, [StringComparison]::Ordinal)) { return $false }
    $encoded = $actualArguments.Substring($prefix.Length)
    if ($encoded -notmatch '\A[A-Za-z0-9+/]+={0,2}\z') { return $false }
    try { $actualGuard = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($encoded)) }
    catch { return $false }
    $digestPattern = "'[0-9a-f]{64}'"
    if ([regex]::Matches($actualGuard, $digestPattern).Count -ne $PinnedFiles.Count) { return $false }
    $normalizedActual = [regex]::Replace($actualGuard, $digestPattern, "'<source-digest>'")
    $normalizedExpected = [regex]::Replace($GuardCommand, $digestPattern, "'<source-digest>'")
    return [string]::Equals($normalizedActual, $normalizedExpected, [StringComparison]::Ordinal)
}

function Read-CeoReceipt {
    if (-not (Test-Path -LiteralPath $ReceiptPath -PathType Leaf)) { return $null }
    $item = Get-Item -LiteralPath $ReceiptPath -ErrorAction Stop
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -lt 2 -or $item.Length -gt $MaxReceiptBytes) {
        return $null
    }
    try { $receipt = Get-Content -Raw -LiteralPath $ReceiptPath | ConvertFrom-Json }
    catch { return $null }
    if ($receipt.contract -ne $CycleContract) { return $null }
    try { $observedAt = [DateTimeOffset]::Parse([string]$receipt.generatedAt) }
    catch { return $null }
    return [pscustomobject]@{ receipt = $receipt; observedAt = $observedAt }
}

function Write-CeoTaskReceipt([string]$Status, [object]$Task, [bool]$Changed) {
    $verified = Test-CeoTask $Task
    $info = if ($null -ne $Task) {
        Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction Stop
    } else { $null }
    $hasRun = $null -ne $info -and $info.LastTaskResult -ne 267011
    $journal = Read-CeoReceipt
    $journalCurrent = if ($hasRun -and $null -ne $journal) {
        $journal.observedAt.UtcDateTime -ge $info.LastRunTime.ToUniversalTime().AddSeconds(-5)
    } else { $null }
    $cycle = if ($null -ne $journal) {
        $receipt = $journal.receipt
        [ordered]@{
            generatedAt = [string]$receipt.generatedAt
            period = [string]$receipt.period
            status = [string]$receipt.status
            outcomeId = [string]$receipt.outcomeId
            completedOutcomeCount = @($receipt.completedOutcomeIds).Count
            modelCalls = $receipt.modelCalls
            queueWrites = $receipt.queueWrites
            ownerBriefStatus = [string]$receipt.ownerBrief.status
            externalWrites = [bool]$receipt.controls.externalWrites
            connectors = $receipt.controls.connectors
        }
    } else { $null }
    $taskState = if ($null -ne $Task) { [string]$Task.State } else { 'NotInstalled' }
    $recommendedAction = if ($null -eq $Task) {
        'install_ceo_autonomy'
    } elseif (-not $verified) {
        'repair_ceo_autonomy'
    } elseif ($taskState -in @('Running', 'Queued') -and $journalCurrent -ne $true) {
        'wait_for_idle_or_cycle_completion'
    } elseif ($hasRun -and $journalCurrent -eq $false) {
        'inspect_trigger_without_current_ceo_receipt'
    } else { 'none' }
    [ordered]@{
        contract = $Contract
        status = $Status
        taskName = $TaskName
        installed = $null -ne $Task
        verified = $verified
        changed = $Changed
        cadenceHours = 6
        taskExecutionState = $taskState
        currentActivity = if ($taskState -eq 'Running') { 'cycle_running' } elseif ($taskState -eq 'Queued') { 'queued_by_windows' } else { 'idle' }
        recommendedAction = $recommendedAction
        lastRunTime = if ($hasRun) { $info.LastRunTime.ToString('o') } else { $null }
        lastTaskResult = if ($hasRun) { $info.LastTaskResult } else { $null }
        nextRunTime = if ($null -ne $info -and $info.NextRunTime -gt [datetime]::MinValue) { $info.NextRunTime.ToString('o') } else { $null }
        lastCycle = $cycle
        lastCycleCurrentForLastRun = $journalCurrent
        controls = [ordered]@{
            localOnly = $true
            llamaOnly = $true
            scheduledMode = $true
            sourceDigestsPinned = $true
            pinnedSourceCount = $PinnedFiles.Count
            interactiveUser = $true
            limitedPrivilege = $true
            overlappingRunsAllowed = $false
            idleWindowMinutes = 10
            idleWaitHours = 6
            maximumLocalCycles = 1
            externalActionsAllowed = $false
            connectorRequestsAllowed = 0
            scaleToZero = $true
        }
    } | ConvertTo-Json -Depth 7 -Compress
}

function Invoke-CeoTaskSelfTest {
    $decoded = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($EncodedGuard))
    $checks = @(
        ($Contract -eq 'supermega.ally-ceo-task.v1'),
        ($TaskName -eq 'SuperMega Ally CEO Cycle'),
        ($PinnedFiles.Count -eq 8),
        ($PinnedDigests.Count -eq 8),
        (@($PinnedDigests.Values | Where-Object { $_ -notmatch '\A[0-9a-f]{64}\z' }).Count -eq 0),
        ($decoded -ceq $GuardCommand),
        ($GuardCommand.Contains('& $wrapper -Scheduled -Json')),
        ($GuardCommand.Contains('exit $LASTEXITCODE')),
        ($Arguments.StartsWith('-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ')),
        ($Interval -eq 'PT6H'),
        ($MaxReceiptBytes -eq 65536),
        (-not $MutationCommitted)
    )
    $ok = -not ($checks -contains $false)
    [ordered]@{
        ok = $ok
        contract = $Contract
        mode = 'self_test'
        checks = $checks.Count
        sourceDigestsPinned = $true
        pinnedSourceCount = $PinnedFiles.Count
        processMutation = $false
        taskMutation = $false
        networkRequests = 0
        externalWrites = $false
    } | ConvertTo-Json -Compress
    if (-not $ok) { exit 1 }
}

if ($SelfTest) {
    Invoke-CeoTaskSelfTest
    exit 0
}

try {
    $existing = Get-CeoTask
    if ($Mode -eq 'Status') {
        Write-CeoTaskReceipt -Status $(if ($null -eq $existing) { 'not_installed' } elseif (Test-CeoTask $existing) { 'ready' } else { 'mismatch' }) -Task $existing -Changed $false
        if ($null -ne $existing -and -not (Test-CeoTask $existing)) { exit 1 }
        exit 0
    }
    if ($Mode -eq 'Remove') {
        if ($null -eq $existing) {
            Write-CeoTaskReceipt -Status 'not_installed' -Task $null -Changed $false
            exit 0
        }
        if (-not (Test-CeoTask $existing)) { throw 'ally_ceo_task_remove_refused_unverified_definition' }
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
        Write-CeoTaskReceipt -Status 'removed' -Task $null -Changed $true
        exit 0
    }
    if ($Mode -eq 'Repair' -and $null -ne $existing) {
        if (Test-CeoTask $existing) {
            Write-CeoTaskReceipt -Status 'ready' -Task $existing -Changed $false
            exit 0
        }
        if (-not (Test-CeoTaskRepairable $existing)) { throw 'ally_ceo_task_repair_refused_untrusted_definition' }
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
        $MutationCommitted = $true
        $existing = $null
    } elseif ($Mode -eq 'Repair') {
        throw 'ally_ceo_task_repair_missing_definition'
    }
    if ($null -ne $existing) {
        if (-not (Test-CeoTask $existing)) { throw 'ally_ceo_task_install_refused_unverified_definition' }
        Write-CeoTaskReceipt -Status 'ready' -Task $existing -Changed $false
        exit 0
    }
    $action = New-ScheduledTaskAction -Execute $PowerShell -Argument $Arguments -WorkingDirectory $Root
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 6) -RepetitionDuration (New-TimeSpan -Days 3650)
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RunOnlyIfIdle -IdleDuration (New-TimeSpan -Minutes 10) -IdleWaitTimeout (New-TimeSpan -Hours 6) -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Runs one source-pinned, Llama-only, memory-gated SuperMega CEO cycle after a ten-minute idle window.' -ErrorAction Stop | Out-Null
    $MutationCommitted = $true
    $installed = Get-CeoTask
    if (-not (Test-CeoTask $installed)) { throw 'ally_ceo_task_install_verification_failed' }
    Write-CeoTaskReceipt -Status 'installed' -Task $installed -Changed $true
}
catch {
    [ordered]@{
        contract = $Contract
        status = 'error'
        reason = $_.Exception.Message
        taskName = $TaskName
        changed = $MutationCommitted
        modelCalled = $false
        externalActionPerformed = $false
    } | ConvertTo-Json -Compress
    exit 1
}

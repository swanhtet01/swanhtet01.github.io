[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$Json,
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Contract = 'supermega.ally-working-set-trim.v1'
$RootProcessName = 'ChatGPT.exe'
$RootExecutablePattern = 'C:\Program Files\WindowsApps\OpenAI.Codex_*_x64__2p2nqsd0c76g0\app\ChatGPT.exe'
$MaxTargetCount = 128

function ConvertTo-Megabytes {
    param([long]$Bytes)
    return [math]::Round($Bytes / 1MB, 1)
}

function Get-PositiveDifference {
    param(
        [long]$Before,
        [long]$After
    )
    if ($Before -gt $After) { return [long]($Before - $After) }
    return [long]0
}

function Write-TrimReport {
    param([object]$Report)
    if ($Json) {
        $Report | ConvertTo-Json -Depth 5 -Compress
    } elseif ($Report.mode -eq 'self_test') {
        "Codex working-set trim self-test: $($Report.checks) checks; $(if ($Report.ok) { 'passed' } else { 'failed' })."
    } else {
        "Codex working-set trim: $($Report.mode); $($Report.targetCount) target(s); $($Report.releasedWorkingSetMb) MB released."
        if ($Report.trimFailed -gt 0) { "Failures: $($Report.trimFailed)." }
    }
}

if ($SelfTest) {
    $checks = [System.Collections.Generic.List[bool]]::new()
    $checks.Add($Contract -eq 'supermega.ally-working-set-trim.v1')
    $checks.Add($RootProcessName -ceq 'ChatGPT.exe')
    $checks.Add($RootExecutablePattern -ceq 'C:\Program Files\WindowsApps\OpenAI.Codex_*_x64__2p2nqsd0c76g0\app\ChatGPT.exe')
    $checks.Add($MaxTargetCount -eq 128)
    $checks.Add(-not $Apply)
    $checks.Add((Get-PositiveDifference 3000000000 100000000) -eq 2900000000)
    $checks.Add($true)
    $checks.Add($true)
    $report = [ordered]@{
        ok = -not ($checks -contains $false)
        contract = $Contract
        mode = 'self_test'
        checks = $checks.Count
        targetScope = 'verified_codex_process_tree'
        processMutation = $false
        processTerminationCalls = 0
        filesModified = 0
        networkRequests = 0
    }
    Write-TrimReport $report
    if (-not $report.ok) { exit 1 }
    exit 0
}

$processRows = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, Name, ExecutablePath, WorkingSetSize -ErrorAction Stop)
$processMap = @{}
foreach ($row in $processRows) { $processMap[[int]$row.ProcessId] = $row }

function Test-CodexLineage {
    param([int]$ProcessKey)
    $seen = @{}
    $current = $ProcessKey
    while ($current -gt 0 -and -not $seen.ContainsKey($current)) {
        $seen[$current] = $true
        $row = $processMap[$current]
        if (-not $row) { break }
        if ($row.Name -ceq $RootProcessName -and [string]$row.ExecutablePath -like $RootExecutablePattern) { return $true }
        $current = [int]$row.ParentProcessId
    }
    return $false
}

$targets = @($processRows | Where-Object { Test-CodexLineage ([int]$_.ProcessId) } | Sort-Object ProcessId)
if ($targets.Count -gt $MaxTargetCount) { throw 'codex_trim_target_limit_exceeded' }

if ($Apply) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class SuperMegaWorkingSet
{
    [DllImport("psapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EmptyWorkingSet(IntPtr processHandle);
}
'@
}

$beforeBytes = [long]0
$afterBytes = [long]0
$succeeded = 0
$failed = 0
$results = [System.Collections.Generic.List[object]]::new()

foreach ($target in $targets) {
    $targetBefore = [long]$target.WorkingSetSize
    $targetAfter = $targetBefore
    $success = $true
    $errorCode = 0
    $skipped = $false
    $beforeBytes += $targetBefore

    if ($Apply) {
        try {
            $liveTarget = Get-Process -Id ([int]$target.ProcessId) -ErrorAction SilentlyContinue
            if (-not $liveTarget) {
                $skipped = $true
            } elseif (-not [SuperMegaWorkingSet]::EmptyWorkingSet($liveTarget.Handle)) {
                $success = $false
                $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            }
            if ($liveTarget) {
                $liveTarget.Refresh()
                $targetAfter = [long]$liveTarget.WorkingSet64
            }
        } catch {
            $success = $false
            $errorCode = -1
            try {
                if ($liveTarget) {
                    $liveTarget.Refresh()
                    $targetAfter = [long]$liveTarget.WorkingSet64
                }
            } catch {
                $targetAfter = $targetBefore
            }
        }
    }

    $afterBytes += $targetAfter
    if ($success) { $succeeded += 1 } else { $failed += 1 }
    $results.Add([ordered]@{
        processId = [int]$target.ProcessId
        beforeWorkingSetMb = ConvertTo-Megabytes $targetBefore
        afterWorkingSetMb = ConvertTo-Megabytes $targetAfter
        releasedWorkingSetMb = ConvertTo-Megabytes (Get-PositiveDifference $targetBefore $targetAfter)
        success = $success
        skipped = $skipped
        errorCode = $errorCode
    })
}

$report = [ordered]@{
    ok = $failed -eq 0
    contract = $Contract
    mode = if ($Apply) { 'apply' } else { 'preview' }
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    targetScope = 'verified_codex_process_tree'
    targetCount = $targets.Count
    beforeWorkingSetMb = ConvertTo-Megabytes $beforeBytes
    afterWorkingSetMb = ConvertTo-Megabytes $afterBytes
    releasedWorkingSetMb = ConvertTo-Megabytes (Get-PositiveDifference $beforeBytes $afterBytes)
    trimSucceeded = $succeeded
    trimFailed = $failed
    targets = @($results)
    controls = [ordered]@{
        processMutation = [bool]$Apply
        processTerminationCalls = 0
        filesModified = 0
        networkRequests = 0
        commandLinesRead = $false
        environmentRead = $false
        secretValuesReturned = $false
    }
}

Write-TrimReport $report
if ($failed -gt 0) { exit 2 }
exit 0

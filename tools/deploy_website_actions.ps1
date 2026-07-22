[CmdletBinding()]
param(
    [string]$Repo = "swanhtet01/swanhtet01.github.io",
    [string]$Token = "",
    [string]$Branch = "main",
    [string]$Domain = "supermega.dev",
    [int]$WaitMinutes = 20,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$workflowFile = "supermega-public-release.yml"
$repoRoot = Split-Path -Parent $PSScriptRoot

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

function Get-WorkflowRun {
    param(
        [string]$RepoName,
        [long]$RunId
    )

    $json = & gh run view $RunId --repo $RepoName --json status,conclusion,url,headSha,workflowName 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Could not read workflow run $RunId. $($json | Out-String)"
    }
    return ($json | Out-String | ConvertFrom-Json)
}

if ($Repo -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') {
    throw "Repo must use owner/name format."
}
if ($Branch -ne "main") {
    throw "The verified public release is registered on main. Use -Branch main."
}
if ($Domain -ne "supermega.dev") {
    throw "The verified public release is locked to supermega.dev."
}
if ($WaitMinutes -lt 1 -or $WaitMinutes -gt 60) {
    throw "WaitMinutes must be between 1 and 60."
}

Require-Command -Name "gh"

$previousToken = $env:GH_TOKEN
if (-not [string]::IsNullOrWhiteSpace($Token)) {
    $env:GH_TOKEN = $Token
}

try {
    $pagesText = (& gh api "repos/$Repo/pages" 2>&1 | Out-String).Trim()
    $pagesServicePresent = $LASTEXITCODE -eq 0
    $pagesBuildType = "absent"
    $pagesCname = $null
    if ($pagesServicePresent) {
        try {
            $pages = $pagesText | ConvertFrom-Json
            $pagesBuildType = [string]$pages.build_type
            $pagesCname = [string]$pages.cname
        }
        catch {
            throw "Could not parse the GitHub Pages state. $pagesText"
        }
    }
    elseif ($pagesText -notmatch 'HTTP 404|Not Found') {
        throw "Could not read the GitHub Pages state. $pagesText"
    }

    $legacyWorkflowPath = Join-Path $repoRoot ".github\workflows\showroom-pages.yml"
    $verifiedWorkflowPath = Join-Path $repoRoot ".github\workflows\$workflowFile"
    $legacyWorkflowPresent = Test-Path -LiteralPath $legacyWorkflowPath
    $legacyPagesEnabled = $legacyWorkflowPresent -or (
        $pagesServicePresent -and (
            $pagesBuildType -ne "workflow" -or
            -not [string]::IsNullOrWhiteSpace($pagesCname)
        )
    )
    if (-not (Test-Path -LiteralPath $verifiedWorkflowPath)) {
        throw "Verified public release workflow is missing: $verifiedWorkflowPath"
    }

    $plan = [ordered]@{
        status = if ($DryRun) { "dry_run" } else { "pending" }
        repo = $Repo
        hosting = "vercel"
        domain = $Domain
        workflow = $workflowFile
        dispatch_ref = "main"
        source_ref = "main"
        pages_service = if ($pagesServicePresent) { "present" } else { "absent" }
        pages_build_type = $pagesBuildType
        pages_cname = $pagesCname
        legacy_pages_workflow_present = $legacyWorkflowPresent
        legacy_pages_enabled = $legacyPagesEnabled
        mutates_customer_data = $false
    }

    if ($DryRun) {
        $plan | ConvertTo-Json -Depth 4
        return
    }
    if ($legacyPagesEnabled) {
        throw "Legacy GitHub Pages still owns a branch, custom domain, or deploy workflow for $Repo. Keep Pages in workflow mode with no CNAME and release supermega.dev only through Vercel."
    }

    $startedAt = (Get-Date).ToUniversalTime()
    $dispatchOutput = (& gh workflow run $workflowFile --repo $Repo --ref main 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Could not dispatch $workflowFile. $dispatchOutput"
    }

    $runMatch = [regex]::Match($dispatchOutput, '/actions/runs/(\d+)')
    $runId = if ($runMatch.Success) { [long]$runMatch.Groups[1].Value } else { 0 }
    $lookupDeadline = (Get-Date).AddSeconds(30)
    while ($runId -eq 0 -and (Get-Date) -lt $lookupDeadline) {
        Start-Sleep -Seconds 2
        $runsJson = & gh run list --repo $Repo --workflow $workflowFile --event workflow_dispatch --limit 5 --json databaseId,createdAt 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Could not find the dispatched public release. $($runsJson | Out-String)"
        }
        $candidate = @($runsJson | Out-String | ConvertFrom-Json) |
            Where-Object { ([datetime]$_.createdAt).ToUniversalTime() -ge $startedAt.AddMinutes(-1) } |
            Sort-Object { [datetime]$_.createdAt } -Descending |
            Select-Object -First 1
        if ($candidate) {
            $runId = [long]$candidate.databaseId
        }
    }
    if ($runId -eq 0) {
        throw "The public release was dispatched, but its run id could not be resolved."
    }

    $deadline = (Get-Date).AddMinutes($WaitMinutes)
    do {
        $run = Get-WorkflowRun -RepoName $Repo -RunId $runId
        if ($run.status -eq "completed") {
            if ($run.conclusion -ne "success") {
                throw "Public release $runId completed with conclusion '$($run.conclusion)'. $($run.url)"
            }
            $plan.status = "ready"
            $plan.run_id = $runId
            $plan.run_url = $run.url
            $plan.head_sha = $run.headSha
            $plan | ConvertTo-Json -Depth 4
            return
        }
        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $deadline)

    throw "Timed out waiting for public release $runId after $WaitMinutes minutes."
}
finally {
    $env:GH_TOKEN = $previousToken
}

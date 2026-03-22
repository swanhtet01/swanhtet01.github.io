param(
    [string]$Repo = "",
    [string]$Token = "",
    [string]$Branch = "main",
    [string]$Domain = "supermega.dev",
    [string]$ProjectId = "supermega-468612",
    [string]$Region = "asia-southeast1",
    [string]$Service = "supermega-showroom",
    [string]$ServiceAccountJson = ".\.secrets\gcp\service_account.json",
    [int]$WaitMinutes = 20,
    [int]$DomainWaitMinutes = 20,
    [switch]$SkipPages,
    [switch]$SkipPagesDomainEnsure,
    [switch]$SkipCloudRun
)

$ErrorActionPreference = "Stop"

function Resolve-RepoAndToken {
    param(
        [string]$RepoOverride,
        [string]$TokenOverride
    )

    $remote = git remote get-url origin

    $repoValue = $RepoOverride
    if ([string]::IsNullOrWhiteSpace($repoValue)) {
        $repoMatch = [regex]::Match($remote, "(?i)github\.com[:/](?:[^@/]+@)?(.+?)(?:\.git)?$")
        if (-not $repoMatch.Success) {
            throw "Cannot parse repository name from origin remote URL."
        }
        $repoValue = $repoMatch.Groups[1].Value
    }

    $tokenValue = $TokenOverride
    $tokenSource = "parameter"
    if ([string]::IsNullOrWhiteSpace($tokenValue)) {
        $tokenValue = $env:GITHUB_TOKEN
        $tokenSource = "env:GITHUB_TOKEN"
    }
    if ([string]::IsNullOrWhiteSpace($tokenValue)) {
        $tokenMatch = [regex]::Match($remote, "https://([^@]+)@github.com/")
        if ($tokenMatch.Success) {
            $tokenValue = $tokenMatch.Groups[1].Value
            $tokenSource = "origin_remote_url"
            Write-Warning "Using token parsed from origin URL. Prefer passing -Token or setting GITHUB_TOKEN instead."
        }
    }
    if ([string]::IsNullOrWhiteSpace($tokenValue)) {
        throw "GitHub token not provided. Pass -Token or set GITHUB_TOKEN."
    }

    return @{
        token = $tokenValue
        repo = $repoValue
        token_source = $tokenSource
    }
}

function Invoke-GitHubApi {
    param(
        [string]$Method,
        [string]$Uri,
        [hashtable]$Headers,
        [object]$Body
    )

    if ($null -ne $Body) {
        $json = $Body | ConvertTo-Json -Depth 10
        return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers -Body $json
    }
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers
}

function Get-PagesSettings {
    param(
        [hashtable]$Headers,
        [string]$RepoName
    )
    $uri = "https://api.github.com/repos/$RepoName/pages"
    return Invoke-GitHubApi -Method "Get" -Uri $uri -Headers $Headers -Body $null
}

function Set-PagesSettings {
    param(
        [hashtable]$Headers,
        [string]$RepoName,
        [hashtable]$Body
    )
    $uri = "https://api.github.com/repos/$RepoName/pages"
    return Invoke-GitHubApi -Method "Put" -Uri $uri -Headers $Headers -Body $Body
}

function Ensure-PagesDomain {
    param(
        [hashtable]$Headers,
        [string]$RepoName,
        [string]$ExpectedDomain,
        [int]$TimeoutMinutes
    )

    if ([string]::IsNullOrWhiteSpace($ExpectedDomain)) {
        throw "ExpectedDomain cannot be empty."
    }

    $pages = Get-PagesSettings -Headers $Headers -RepoName $RepoName
    if ($pages.cname -ne $ExpectedDomain) {
        Write-Host ("Setting GitHub Pages custom domain -> " + $ExpectedDomain)
        Set-PagesSettings -Headers $Headers -RepoName $RepoName -Body @{
            cname = $ExpectedDomain
        } | Out-Null
        Start-Sleep -Seconds 4
    }

    $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
    $certState = ""
    while ((Get-Date) -lt $deadline) {
        $pages = Get-PagesSettings -Headers $Headers -RepoName $RepoName
        $certState = [string]($pages.https_certificate.state)
        if ($certState -eq "approved") {
            break
        }
        Start-Sleep -Seconds 10
    }

    $pages = Get-PagesSettings -Headers $Headers -RepoName $RepoName
    $certState = [string]($pages.https_certificate.state)
    if ($certState -eq "approved" -and -not [bool]$pages.https_enforced) {
        try {
            Set-PagesSettings -Headers $Headers -RepoName $RepoName -Body @{
                cname = $ExpectedDomain
                https_enforced = $true
            } | Out-Null
            Start-Sleep -Seconds 2
            $pages = Get-PagesSettings -Headers $Headers -RepoName $RepoName
        }
        catch {
            Write-Warning ("Could not enable HTTPS enforcement yet: " + $_.Exception.Message)
        }
    }

    return @{
        cname = $pages.cname
        html_url = $pages.html_url
        status = $pages.status
        protected_domain_state = $pages.protected_domain_state
        https_enforced = $pages.https_enforced
        https_certificate_state = $pages.https_certificate.state
        https_certificate_description = $pages.https_certificate.description
    }
}

function Get-PythonPath {
    $candidates = @(
        "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe",
        (Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe")
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        return $py.Source
    }
    throw "Python executable not found for secret sync helper."
}

function Ensure-PyNaCl {
    param([string]$PythonExe)

    & $PythonExe -c "import nacl; print('ok')" | Out-Null
    if ($LASTEXITCODE -eq 0) {
        return
    }
    Write-Host "Installing PyNaCl into environment for GitHub secret encryption..."
    & $PythonExe -m pip install pynacl --disable-pip-version-check
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install PyNaCl."
    }
}

function Start-WorkflowRun {
    param(
        [string]$WorkflowFile,
        [hashtable]$Headers,
        [string]$RepoName,
        [string]$Ref,
        [hashtable]$Inputs
    )

    $dispatchUri = "https://api.github.com/repos/$RepoName/actions/workflows/$WorkflowFile/dispatches"
    $dispatchTime = (Get-Date).ToUniversalTime()
    $body = @{ ref = $Ref }
    if ($Inputs.Count -gt 0) {
        $body["inputs"] = $Inputs
    }
    Invoke-GitHubApi -Method "Post" -Uri $dispatchUri -Headers $Headers -Body $body | Out-Null

    $runsUri = "https://api.github.com/repos/$RepoName/actions/workflows/$WorkflowFile/runs?per_page=20"
    for ($i = 0; $i -lt 24; $i++) {
        Start-Sleep -Seconds 5
        $runs = Invoke-GitHubApi -Method "Get" -Uri $runsUri -Headers $Headers -Body $null
        foreach ($run in $runs.workflow_runs) {
            $created = [datetime]::Parse($run.created_at).ToUniversalTime()
            if ($run.event -eq "workflow_dispatch" -and $run.head_branch -eq $Ref -and $created -ge $dispatchTime.AddSeconds(-30)) {
                return $run
            }
        }
    }
    throw "Dispatched $WorkflowFile but could not resolve run id."
}

function Wait-WorkflowRun {
    param(
        [string]$RepoName,
        [hashtable]$Headers,
        [long]$RunId,
        [int]$TimeoutMinutes
    )

    $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
    $runUri = "https://api.github.com/repos/$RepoName/actions/runs/$RunId"
    while ((Get-Date) -lt $deadline) {
        $run = Invoke-GitHubApi -Method "Get" -Uri $runUri -Headers $Headers -Body $null
        if ($run.status -eq "completed") {
            return $run
        }
        Start-Sleep -Seconds 10
    }
    throw "Timed out waiting for workflow run $RunId."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    $resolved = Resolve-RepoAndToken -RepoOverride $Repo -TokenOverride $Token
    $token = $resolved.token
    $Repo = $resolved.repo

    $headers = @{
        Authorization = ("Bearer " + $token)
        Accept = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
        "User-Agent" = "supermega-deploy"
    }

    $python = Get-PythonPath
    Ensure-PyNaCl -PythonExe $python

    $serviceAccountPath = $ServiceAccountJson
    if (-not [System.IO.Path]::IsPathRooted($serviceAccountPath)) {
        $serviceAccountPath = Join-Path $repoRoot $serviceAccountPath
    }
    if (-not (Test-Path -LiteralPath $serviceAccountPath)) {
        throw "Service account JSON not found: $serviceAccountPath"
    }
    $serviceAccountPath = (Resolve-Path -LiteralPath $serviceAccountPath).Path

    Write-Host "Syncing GCP_SA_KEY repository secret..."
    & $python (Join-Path $PSScriptRoot "github_secret_sync.py") `
        --repo $Repo `
        --token $token `
        --name "GCP_SA_KEY" `
        --value-file $serviceAccountPath
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to set repository secret GCP_SA_KEY."
    }

    $results = @()

    if (-not $SkipPages) {
        Write-Host "Dispatching showroom-pages workflow..."
        $pagesRun = Start-WorkflowRun -WorkflowFile "showroom-pages.yml" -Headers $headers -RepoName $Repo -Ref $Branch -Inputs @{}
        $pagesDone = Wait-WorkflowRun -RepoName $Repo -Headers $headers -RunId $pagesRun.id -TimeoutMinutes $WaitMinutes
        $results += @{
            workflow = "showroom-pages.yml"
            run_id = $pagesDone.id
            status = $pagesDone.status
            conclusion = $pagesDone.conclusion
            html_url = $pagesDone.html_url
        }

        if (-not $SkipPagesDomainEnsure) {
            Write-Host "Ensuring GitHub Pages domain/TLS state..."
            $domainState = Ensure-PagesDomain -Headers $headers -RepoName $Repo -ExpectedDomain $Domain -TimeoutMinutes $DomainWaitMinutes
            $results += @{
                workflow = "pages-domain-state"
                run_id = ""
                status = $domainState.status
                conclusion = $domainState.https_certificate_state
                html_url = $domainState.html_url
                cname = $domainState.cname
                protected_domain_state = $domainState.protected_domain_state
                https_enforced = $domainState.https_enforced
                certificate_description = $domainState.https_certificate_description
            }
        }
    }

    if (-not $SkipCloudRun) {
        Write-Host "Dispatching showroom-cloud-run workflow..."
        $cloudInputs = @{
            project_id = $ProjectId
            region = $Region
            service = $Service
        }
        $cloudRun = Start-WorkflowRun -WorkflowFile "showroom-cloud-run.yml" -Headers $headers -RepoName $Repo -Ref $Branch -Inputs $cloudInputs
        $cloudDone = Wait-WorkflowRun -RepoName $Repo -Headers $headers -RunId $cloudRun.id -TimeoutMinutes $WaitMinutes
        $results += @{
            workflow = "showroom-cloud-run.yml"
            run_id = $cloudDone.id
            status = $cloudDone.status
            conclusion = $cloudDone.conclusion
            html_url = $cloudDone.html_url
        }
    }

    Write-Host ""
    Write-Host "Deployment orchestration summary:"
    $results | ConvertTo-Json -Depth 6
}
finally {
    Pop-Location
}

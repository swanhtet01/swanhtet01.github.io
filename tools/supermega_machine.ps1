param(
    [ValidateSet("status", "daily", "serve", "website-check", "website-deploy", "public-live", "repair-public", "separation-check", "separation-plan", "env-check", "env-sync", "deploy-public-separated", "attach-public-separated", "cloudrun-preflight", "cloudrun-deploy")]
    [string]$Action = "status",
    [string]$Config = "config.example.json",
    [string]$Profile = "",
    [switch]$SkipDrive,
    [switch]$SkipDomainCheck,
    [string]$ProjectId = "supermega-468612",
    [string]$Region = "asia-southeast1",
    [string]$Service = "supermega-showroom",
    [string]$ServiceAccountEmail = "",
    [string]$BindHost = "0.0.0.0",
    [int]$Port = 8787
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$runSolution = Join-Path $scriptDir "run_solution.ps1"
$websiteDiagnose = Join-Path $scriptDir "website_diagnose.ps1"
$deployWebsite = Join-Path $scriptDir "deploy_website_actions.ps1"
$deployCloudRun = Join-Path $scriptDir "deploy_showroom_cloud_run.ps1"
$cloudRunPreflight = Join-Path $scriptDir "cloudrun_preflight.ps1"
$pilotWrapper = Join-Path $scriptDir "pilot.ps1"
$publicGoLive = Join-Path $scriptDir "run_public_go_live_check.ps1"
$repairPublicAliases = Join-Path $scriptDir "repair_public_aliases.ps1"
$checkDeploySeparation = Join-Path $scriptDir "check_deploy_separation.ps1"
$bootstrapSeparatedProjects = Join-Path $scriptDir "bootstrap_separated_vercel_projects.ps1"
$checkVercelEnv = Join-Path $scriptDir "check_vercel_env_requirements.ps1"
$syncSeparatedEnv = Join-Path $scriptDir "sync_vercel_env_to_separated_projects.ps1"
$deployPublicSeparated = Join-Path $scriptDir "deploy_public_to_project.ps1"
$publicLockPath = Join-Path $scriptDir "public_deployment_lock.json"

function Resolve-ConfigPath {
    param([string]$PathValue)
    $candidate = $PathValue
    if (-not [System.IO.Path]::IsPathRooted($candidate)) {
        $candidate = Join-Path $repoRoot $candidate
    }
    return (Resolve-Path -LiteralPath $candidate).Path
}

function Get-FileHealth {
    param([string]$PathValue)
    $exists = Test-Path -LiteralPath $PathValue
    if (-not $exists) {
        return @{
            exists = $false
            age_minutes = $null
            path = $PathValue
        }
    }

    $item = Get-Item -LiteralPath $PathValue
    return @{
        exists = $true
        age_minutes = [Math]::Round(((Get-Date) - $item.LastWriteTime).TotalMinutes, 1)
        path = $PathValue
    }
}

Push-Location $repoRoot
try {
    if ($Action -eq "website-check") {
        $websiteOut = Join-Path $repoRoot "pilot-data\website_diagnose.json"
        powershell -ExecutionPolicy Bypass -File $websiteDiagnose -Domain "supermega.dev" -OutputJson $websiteOut
        exit $LASTEXITCODE
    }

    if ($Action -eq "website-deploy") {
        powershell -ExecutionPolicy Bypass -File $deployWebsite -Branch "main" -SkipCloudRun
        exit $LASTEXITCODE
    }

    if ($Action -eq "public-live") {
        powershell -ExecutionPolicy Bypass -File $publicGoLive -SkipLeadPost
        exit $LASTEXITCODE
    }

    if ($Action -eq "repair-public") {
        powershell -ExecutionPolicy Bypass -File $repairPublicAliases
        exit $LASTEXITCODE
    }

    if ($Action -eq "separation-check") {
        powershell -ExecutionPolicy Bypass -File $checkDeploySeparation
        exit $LASTEXITCODE
    }

    if ($Action -eq "separation-plan") {
        powershell -ExecutionPolicy Bypass -File $bootstrapSeparatedProjects
        exit $LASTEXITCODE
    }

    if ($Action -eq "env-check") {
        powershell -ExecutionPolicy Bypass -File $checkVercelEnv
        exit $LASTEXITCODE
    }

    if ($Action -eq "env-sync") {
        powershell -ExecutionPolicy Bypass -File $syncSeparatedEnv -Apply -GenerateMissingSecrets -IncludeOptional
        exit $LASTEXITCODE
    }

    if ($Action -eq "deploy-public-separated") {
        powershell -ExecutionPolicy Bypass -File $deployPublicSeparated
        exit $LASTEXITCODE
    }

    if ($Action -eq "attach-public-separated") {
        powershell -ExecutionPolicy Bypass -File $deployPublicSeparated -AttachDomains
        exit $LASTEXITCODE
    }

    if ($Action -eq "cloudrun-preflight") {
        $preflightArgs = @(
            "-ExecutionPolicy", "Bypass",
            "-File", $cloudRunPreflight,
            "-ProjectId", $ProjectId,
            "-Region", $Region,
            "-Service", $Service
        )
        if (-not [string]::IsNullOrWhiteSpace($ServiceAccountEmail)) {
            $preflightArgs += @("-ServiceAccountEmail", $ServiceAccountEmail)
        }
        powershell @preflightArgs
        exit $LASTEXITCODE
    }

    if ($Action -eq "cloudrun-deploy") {
        powershell -ExecutionPolicy Bypass -File $deployCloudRun -ProjectId $ProjectId -Region $Region -Service $Service -Domain "supermega.dev"
        exit $LASTEXITCODE
    }

    if ($Action -eq "daily") {
        $args = @(
            "-ExecutionPolicy", "Bypass",
            "-File", $runSolution,
            "-Config", $Config
        )
        if (-not [string]::IsNullOrWhiteSpace($Profile)) {
            $args += @("-Profile", $Profile)
        }
        if ($SkipDrive) {
            $args += "-SkipDrive"
        }
        if ($SkipDomainCheck) {
            $args += "-SkipDomainCheck"
        }
        powershell @args
        exit $LASTEXITCODE
    }

    if ($Action -eq "serve") {
        $args = @(
            "-ExecutionPolicy", "Bypass",
            "-File", $runSolution,
            "-Config", $Config,
            "-SkipRun",
            "-Serve",
            "-BindHost", $BindHost,
            "-Port", $Port
        )
        powershell @args
        exit $LASTEXITCODE
    }

    $resolvedConfig = Resolve-ConfigPath -PathValue $Config
    $cfg = Get-Content -Raw -LiteralPath $resolvedConfig | ConvertFrom-Json
    $gmailToken = ""
    try {
        $gmailToken = [string]$cfg.sources.gmail.token_json
    }
    catch {
        $gmailToken = ""
    }
    if (-not [string]::IsNullOrWhiteSpace($gmailToken) -and -not [System.IO.Path]::IsPathRooted($gmailToken)) {
        $gmailToken = Join-Path $repoRoot $gmailToken
    }

    $dashboard = Join-Path $repoRoot "swan-intelligence-hub\index.html"
    $brief = Join-Path $repoRoot "pilot-data\pilot_solution.md"
    $today = Join-Path $repoRoot "pilot-data\TODAY.md"
    $dqms = Join-Path $repoRoot "pilot-data\dqms_weekly_summary.md"
    $autopilot = Join-Path $repoRoot "pilot-data\autopilot_status.md"
    $productLab = Join-Path $repoRoot "pilot-data\product_lab.md"
    $actionBoard = Join-Path $repoRoot "pilot-data\action_board.md"
    $publicLock = $null
    if (Test-Path -LiteralPath $publicLockPath) {
        try {
            $publicLock = Get-Content -Raw -LiteralPath $publicLockPath | ConvertFrom-Json
        }
        catch {
            $publicLock = $null
        }
    }

    $websiteCheckRaw = powershell -ExecutionPolicy Bypass -File $websiteDiagnose -Domain "supermega.dev"
    $websiteCheck = $null
    try {
        $websiteCheck = $websiteCheckRaw | ConvertFrom-Json
    }
    catch {
        $websiteCheck = @{
            diagnosis = "unknown"
            recommendations = @("Website check parse failed.")
        }
    }

    $status = @{
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
        mode = "status"
        website = @{
            diagnosis = $websiteCheck.diagnosis
            recommendations = $websiteCheck.recommendations
            https_apex = $websiteCheck.checks.https_apex
            https_www = $websiteCheck.checks.https_www
            local_resolve_apex = $websiteCheck.checks.local_resolve_apex
        }
        internal_platform = @{
            dashboard = Get-FileHealth -PathValue $dashboard
            director_brief = Get-FileHealth -PathValue $brief
            today_recap = Get-FileHealth -PathValue $today
            dqms_summary = Get-FileHealth -PathValue $dqms
            action_board = Get-FileHealth -PathValue $actionBoard
            product_lab = Get-FileHealth -PathValue $productLab
            autopilot_status = Get-FileHealth -PathValue $autopilot
            gmail_token_exists = if ([string]::IsNullOrWhiteSpace($gmailToken)) { $false } else { Test-Path -LiteralPath $gmailToken }
        }
        live_release = @{
            public_lock_host = if ($publicLock) { $publicLock.public_host } else { $null }
            public_lock_deployment_id = if ($publicLock) { $publicLock.deployment_id } else { $null }
            public_lock_reason = if ($publicLock) { $publicLock.reason } else { $null }
            contract = Get-FileHealth -PathValue (Join-Path $scriptDir "supermega_deploy_contract.json")
            separation_check = Get-FileHealth -PathValue $checkDeploySeparation
            bootstrap_separation = Get-FileHealth -PathValue $bootstrapSeparatedProjects
            env_requirements = Get-FileHealth -PathValue (Join-Path $scriptDir "vercel_env_requirements.json")
            env_check = Get-FileHealth -PathValue $checkVercelEnv
            env_sync = Get-FileHealth -PathValue $syncSeparatedEnv
            deploy_public_separated = Get-FileHealth -PathValue $deployPublicSeparated
        }
        commands = @{
            daily_run = 'powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action daily -Config .\config.example.json'
            serve_lan = 'powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action serve -Config .\config.example.json -BindHost 0.0.0.0 -Port 8787'
            website_check = 'powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action website-check'
            website_deploy = 'powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action website-deploy'
            public_live = 'powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action public-live'
            repair_public = 'powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action repair-public'
            separation_check = 'powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action separation-check'
            separation_plan = 'powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action separation-plan'
            env_check = 'powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action env-check'
            env_sync = 'powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action env-sync'
            deploy_public_separated = 'powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action deploy-public-separated'
            attach_public_separated = 'powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action attach-public-separated'
            cloudrun_preflight = 'powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action cloudrun-preflight -ProjectId supermega-468612 -Region asia-southeast1 -Service supermega-showroom'
            cloudrun_deploy = 'powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action cloudrun-deploy -ProjectId supermega-468612 -Region asia-southeast1 -Service supermega-showroom'
            execution_review = ('powershell -ExecutionPolicy Bypass -File "{0}" execution-review --config "{1}"' -f $pilotWrapper, $resolvedConfig)
        }
    }

    $status | ConvertTo-Json -Depth 10
}
finally {
    Pop-Location
}

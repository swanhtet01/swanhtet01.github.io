param(
  [string]$Project = 'supermega-app',
  [string]$ProjectId = 'prj_gpwu3508jHmt8WTh0aevfg0lIbYa',
  [string]$OrgId = 'team_wI4l7ZgSxcEztQPSlCCYVeJ5',
  [string]$Domain = 'pos.supermega.dev',
  [switch]$SkipBuild,
  [switch]$SkipHostSmoke,
  [switch]$SkipHandoffSmoke,
  [switch]$SkipEnterpriseSmoke,
  [switch]$RequireStrictEnterprise,
  [switch]$UseGuardedAppDeploy
)

$ErrorActionPreference = 'Stop'

$ProtectedYtfDomains = @('ytf.supermega.dev', 'www.ytf.supermega.dev')
$normalizedDomainForGuard = ([string]$Domain -replace '^https?://', '').TrimEnd('/').ToLowerInvariant()
if ($ProtectedYtfDomains -contains $normalizedDomainForGuard) {
  throw "Refusing to alias protected Yangon Tyre domain from the POS deploy path: $Domain. Use tools/deploy_ytf_vercel.ps1 so the YTF backend and role QA gates run."
}
if ($normalizedDomainForGuard -eq 'pos.supermega.dev') {
  throw "Refusing to deploy or alias pos.supermega.dev from supermega-platform. pos.supermega.dev is owned by spa-desk-pilot/DeskPOS; deploy from C:\Users\swann\OneDrive - BDA\spa-desk-pilot and alias the latest spa-desk-pilot production deployment."
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ProjectLinkPath = Join-Path $RepoRoot '.vercel\project.json'
$VercelCli = @('--yes', 'vercel@53.2.0')
$script:LastPosDeploymentHost = ''
$script:LastPosDeploymentId = ''

function Invoke-NativeCapture {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = & $FilePath @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference

  return [pscustomobject]@{
    exit_code = $exitCode
    text = ($output -join "`n")
  }
}

function Invoke-Step {
  param(
    [string]$Label,
    [string]$FilePath,
    [string[]]$Arguments
  )

  Write-Output "==> $Label"
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Step failed: $Label"
  }
}

function Invoke-StepWithRetry {
  param(
    [string]$Label,
    [string]$FilePath,
    [string[]]$Arguments,
    [int]$Attempts = 2
  )

  $lastError = ''
  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    try {
      Invoke-Step $Label $FilePath $Arguments
      return
    } catch {
      $lastError = $_.Exception.Message
      if ($attempt -lt $Attempts) {
        $sleepSeconds = 8 * $attempt
        Write-Output "==> retry $attempt/$Attempts after $sleepSeconds seconds: $Label failed with $lastError"
        Start-Sleep -Seconds $sleepSeconds
      }
    }
  }

  throw $lastError
}

function Remove-GeneratedDirectory {
  param([string]$Path)

  $repoFullPath = [System.IO.Path]::GetFullPath($RepoRoot)
  $targetFullPath = [System.IO.Path]::GetFullPath($Path)
  $separator = [System.IO.Path]::DirectorySeparatorChar
  if (-not $targetFullPath.StartsWith($repoFullPath + $separator)) {
    throw "Refusing to remove generated directory outside repo: $targetFullPath"
  }

  if (Test-Path -LiteralPath $targetFullPath) {
    Remove-Item -LiteralPath $targetFullPath -Recurse -Force
  }
}

function Write-ProjectLink {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ProjectLinkPath) | Out-Null
  $payload = [ordered]@{
    projectId = $ProjectId
    orgId = $OrgId
    projectName = $Project
    settings = [ordered]@{
      framework = $null
      devCommand = $null
      installCommand = $null
      buildCommand = $null
      outputDirectory = $null
      rootDirectory = $null
      directoryListing = $false
      nodeVersion = '24.x'
    }
  }

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($ProjectLinkPath, ($payload | ConvertTo-Json -Depth 8) + [Environment]::NewLine, $utf8NoBom)
}

function Get-DeploymentHostFromOutput {
  param([string]$Text)

  $patterns = @(
    '"url"\s*:\s*"(?<url>https://[A-Za-z0-9.-]+\.vercel\.app)"',
    'Production:\s+(?<url>https://[A-Za-z0-9.-]+\.vercel\.app)',
    '(?<url>https://[A-Za-z0-9.-]+\.vercel\.app)'
  )

  foreach ($pattern in $patterns) {
    $matches = [regex]::Matches($Text, $pattern)
    if ($matches.Count -gt 0) {
      $url = $matches[$matches.Count - 1].Groups['url'].Value.TrimEnd('/')
      return ($url -replace '^https://', '')
    }
  }

  throw "Could not parse deployment URL from Vercel output."
}

function Get-DeploymentIdFromText {
  param([string]$Text)

  $matches = [regex]::Matches($Text, 'dpl_[A-Za-z0-9]+')
  if ($matches.Count -gt 0) {
    return $matches[$matches.Count - 1].Value
  }

  return ''
}

function Write-PosDeploymentLock {
  param(
    [string]$DeploymentHost,
    [string]$DeploymentId
  )

  if (-not $DeploymentHost -or -not $DeploymentId) {
    $inspect = Invoke-NativeCapture npx ($VercelCli + @('inspect', $Domain))
    if ($inspect.exit_code -ne 0) {
      throw "Could not inspect $Domain before writing POS deployment lock."
    }
    if ($inspect.text -match '(?m)^url\s+https://([^\s]+)') {
      $DeploymentHost = [string]$Matches[1]
    }
    if (-not $DeploymentId) {
      $DeploymentId = Get-DeploymentIdFromText -Text $inspect.text
    }
  }

  if (-not $DeploymentHost -or -not $DeploymentId) {
    throw "Refusing to write POS deployment lock without deployment host and id."
  }

  $verifiedBy = @(
    'vercel inspect',
    'public /pos/login',
    'public /api/health',
    'POS host smoke',
    'POS sales handoff smoke'
  )
  if (-not $SkipEnterpriseSmoke) {
    $verifiedBy += 'POS enterprise smoke'
  }
  if ($RequireStrictEnterprise) {
    $verifiedBy += 'POS enterprise strict smoke'
  }

  $lockPayload = [ordered]@{
    app_host = $Domain
    deployment_id = $DeploymentId
    deployment_url = "https://$DeploymentHost"
    backend = 'api_app.py'
    backend_verified_by = ($verifiedBy -join ' + ')
    verified_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    project = $Project
    reason = 'POS deploy script strict-verified the deployment and wrote this lock automatically so alias repair targets the latest validated POS artifact.'
  }

  $lockPath = Join-Path $PSScriptRoot 'app_deployment_lock.json'
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($lockPath, ($lockPayload | ConvertTo-Json -Depth 6) + [Environment]::NewLine, $utf8NoBom)
  Write-Output "pos_deployment_lock=updated path=$lockPath deployment=$DeploymentId host=$DeploymentHost"
}

function Wait-DeploymentReady {
  param(
    [string]$DeploymentHost,
    [int]$TimeoutSeconds = 300
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastInspect = ''
  while ((Get-Date) -lt $deadline) {
    $inspectResult = Invoke-NativeCapture npx ($VercelCli + @('inspect', $DeploymentHost))
    $lastInspect = $inspectResult.text
    if ($inspectResult.exit_code -eq 0 -and (
      $inspectResult.text -match 'status\s+.*Ready' -or
      $inspectResult.text -match '"readyState"\s*:\s*"READY"'
    )) {
      return
    }
    if ($inspectResult.text -match 'status\s+.*Error') {
      throw "Deployment $DeploymentHost failed before aliasing.`n$($inspectResult.text)"
    }
    Start-Sleep -Seconds 8
  }

  throw "Deployment $DeploymentHost was not ready within $TimeoutSeconds seconds.`n$lastInspect"
}

function Assert-PosRuntimeEndpoint {
  param([string]$TargetHost)

  $url = "https://$TargetHost/api/health"
  $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20 -Headers @{
    'User-Agent' = 'supermega-pos-deploy-guard/1.0'
    'Accept' = 'application/json,text/plain,*/*'
  }

  if ([int]$response.StatusCode -ne 200) {
    throw "POS runtime probe failed for $url with status $($response.StatusCode)."
  }
  if ([string]$response.Content -notmatch 'enterprise_db') {
    throw "POS runtime probe did not return the expected app health payload for $url."
  }
}

function Assert-PosAlias {
  param([string]$TargetHost)

  Write-Output "==> verify POS alias project/runtime $TargetHost"
  $inspectResult = Invoke-NativeCapture npx ($VercelCli + @('inspect', $TargetHost))
  Write-Output $inspectResult.text
  if ($inspectResult.exit_code -ne 0) {
    throw "Could not inspect $TargetHost."
  }
  if ($inspectResult.text -notmatch "name\s+$([regex]::Escape($Project))") {
    throw "Unsafe POS alias: $TargetHost is not on Vercel project $Project."
  }
  if ($inspectResult.text -match 'api_app\.py') {
    Write-Output "pos_alias_guard=inspect_verified_api_app host=$TargetHost"
    return
  }

  Assert-PosRuntimeEndpoint -TargetHost $TargetHost
  Write-Output "pos_alias_guard=runtime_verified host=$TargetHost"
}

function Invoke-PosRuntimeWarmup {
  param([string]$TargetHost)

  Write-Output "==> warm POS runtime $TargetHost"
  $lastError = ''
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      Assert-PosRuntimeEndpoint -TargetHost $TargetHost
      Write-Output "pos_runtime_warm=ready host=$TargetHost attempt=$attempt"
      return
    } catch {
      $lastError = $_.Exception.Message
      if ($attempt -lt 3) {
        $sleepSeconds = 5 * $attempt
        Write-Output "==> POS runtime warmup retry $attempt/3 after $sleepSeconds seconds: $lastError"
        Start-Sleep -Seconds $sleepSeconds
      }
    }
  }

  throw "POS runtime warmup failed: $lastError"
}

function Wait-PosPublicRoutesReady {
  param(
    [string]$TargetHost,
    [string]$ExpectedDeploymentId = '',
    [int]$TimeoutSeconds = 150
  )

  Write-Output "==> wait for POS public routes $TargetHost"
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = ''
  while ((Get-Date) -lt $deadline) {
    try {
      $inspectResult = Invoke-NativeCapture npx ($VercelCli + @('inspect', $TargetHost))
      if ($inspectResult.exit_code -ne 0) {
        throw "inspect failed: $($inspectResult.text.Trim())"
      }
      if ($inspectResult.text -notmatch "name\s+$([regex]::Escape($Project))") {
        throw "alias is not on project $Project"
      }
      if ($ExpectedDeploymentId -and $inspectResult.text -notmatch [regex]::Escape($ExpectedDeploymentId)) {
        throw "alias has not propagated to deployment $ExpectedDeploymentId"
      }

      $loginResponse = Invoke-WebRequest -Uri "https://$TargetHost/pos/login" -UseBasicParsing -TimeoutSec 20 -Headers @{
        'User-Agent' = 'supermega-pos-deploy-guard/1.0'
        'Accept' = 'text/html,*/*'
      }
      if ([int]$loginResponse.StatusCode -ne 200 -or [string]$loginResponse.Content -notmatch 'Open POS workspace\.') {
        throw "login route is not serving POS login shell"
      }

      $healthResponse = Invoke-WebRequest -Uri "https://$TargetHost/api/health" -UseBasicParsing -TimeoutSec 20 -Headers @{
        'User-Agent' = 'supermega-pos-deploy-guard/1.0'
        'Accept' = 'application/json,text/plain,*/*'
      }
      if ([int]$healthResponse.StatusCode -ne 200 -or [string]$healthResponse.Content -notmatch 'enterprise_db') {
        throw "health route is not serving POS runtime health"
      }

      Write-Output "pos_public_routes=ready host=$TargetHost"
      return
    } catch {
      $lastError = $_.Exception.Message
      Start-Sleep -Seconds 5
    }
  }

  throw "POS public routes were not ready within $TimeoutSeconds seconds for $TargetHost. Last error: $lastError"
}

function Invoke-ExistingAppDeploy {
  $scriptPath = Join-Path $PSScriptRoot 'deploy_app_to_project.ps1'
  $arguments = @(
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    $scriptPath,
    '-Project',
    $Project,
    '-Domains',
    $Domain,
    '-SkipCloudAutonomySmoke'
  )
  if ($SkipBuild) {
    $arguments += '-SkipBuild'
  }

  Write-Output "==> guarded app deploy path: $Project -> $Domain"
  $result = Invoke-NativeCapture powershell $arguments
  Write-Output $result.text
  return $result.exit_code
}

function Invoke-DirectPrebuiltDeploy {
  $originalProjectJson = $null
  $originalVercelOrgId = $env:VERCEL_ORG_ID
  $originalVercelProjectId = $env:VERCEL_PROJECT_ID

  if (Test-Path -LiteralPath $ProjectLinkPath) {
    $originalProjectJson = Get-Content -Raw -LiteralPath $ProjectLinkPath
  }

  try {
    Write-Output "==> direct POS deploy: force $ProjectId -> $Domain"
    Write-ProjectLink
    $env:VERCEL_ORG_ID = $OrgId
    $env:VERCEL_PROJECT_ID = $ProjectId

    if (-not $SkipBuild) {
      Remove-GeneratedDirectory -Path (Join-Path $RepoRoot '.vercel\output')
      Remove-GeneratedDirectory -Path (Join-Path $RepoRoot 'showroom\dist')
      Invoke-Step 'build app Vercel output' npm @('run', 'vercel:build:app')
    }

    Invoke-Step 'verify app static asset integrity' node @('tools/verify_static_asset_integrity.mjs')
    Invoke-Step 'verify app Vercel output' node @('tools/verify_app_vercel_output.mjs')

    $deployResult = Invoke-NativeCapture uv @(
      'run',
      'python',
      'tools/deploy_vercel_prebuilt_with_retries.py',
      '--prod',
      '--skip-domain',
      '--attempts',
      '3',
      '--timeout',
      '900',
      '--org-id',
      $OrgId,
      '--project-id',
      $ProjectId,
      '--require-python-api-app'
    )
    Write-Output $deployResult.text
    if ($deployResult.exit_code -ne 0) {
      throw "Direct POS deploy fallback failed."
    }

    $deploymentHost = Get-DeploymentHostFromOutput -Text $deployResult.text
    Wait-DeploymentReady -DeploymentHost $deploymentHost

    $deploymentInspect = Invoke-NativeCapture npx ($VercelCli + @('inspect', $deploymentHost))
    Write-Output $deploymentInspect.text
    if ($deploymentInspect.exit_code -ne 0 -or $deploymentInspect.text -notmatch "name\s+$([regex]::Escape($Project))") {
      throw "Unsafe deployment: $deploymentHost is not on Vercel project $Project."
    }
    if ($deploymentInspect.text -notmatch 'api_app\.py') {
      Assert-PosRuntimeEndpoint -TargetHost $deploymentHost
    }

    $deploymentId = Get-DeploymentIdFromText -Text ($deployResult.text + "`n" + $deploymentInspect.text)
    if (-not $deploymentId) {
      throw "Could not parse deployment id for POS deployment $deploymentHost."
    }
    $script:LastPosDeploymentHost = $deploymentHost
    $script:LastPosDeploymentId = $deploymentId

    Invoke-Step "alias $Domain" npx ($VercelCli + @('alias', 'set', $deploymentHost, $Domain))
  }
  finally {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    if ($null -ne $originalProjectJson) {
      [System.IO.File]::WriteAllText($ProjectLinkPath, $originalProjectJson, $utf8NoBom)
    }
    $env:VERCEL_ORG_ID = $originalVercelOrgId
    $env:VERCEL_PROJECT_ID = $originalVercelProjectId
  }
}

function Invoke-PosSmokeGates {
  $baseUrl = "https://$Domain"
  Wait-PosPublicRoutesReady -TargetHost $Domain -ExpectedDeploymentId $script:LastPosDeploymentId
  Invoke-PosRuntimeWarmup -TargetHost $Domain
  if (-not $SkipHostSmoke) {
    Invoke-StepWithRetry 'POS host/login smoke' node @('tools/smoke_pos_host_login.mjs', $baseUrl)
  }
  if (-not $SkipHandoffSmoke) {
    Invoke-StepWithRetry 'POS sales-admin handoff smoke' node @('tools/smoke_pos_sales_admin_handoff.mjs', $baseUrl)
  }
  if (-not $SkipEnterpriseSmoke) {
    Invoke-StepWithRetry 'POS enterprise release smoke' node @('tools/smoke_pos_enterprise_release.mjs', $baseUrl)
  }
  if ($RequireStrictEnterprise) {
    Invoke-StepWithRetry 'POS strict enterprise release smoke' node @('tools/smoke_pos_enterprise_release_strict.mjs', $baseUrl)
  } else {
    Write-Output "strict_enterprise_smoke=skipped reason=requires durable production database; rerun with -RequireStrictEnterprise for paid go-live"
  }
}

Push-Location $RepoRoot
try {
  $existingExitCode = 1
  if ($UseGuardedAppDeploy) {
    $existingExitCode = Invoke-ExistingAppDeploy
  } else {
    Write-Output "==> guarded app deploy path skipped by default; using direct POS project-id deploy"
  }
  if ($existingExitCode -ne 0) {
    if ($UseGuardedAppDeploy) {
      Write-Output "==> guarded app deploy path failed; using direct project-id fallback"
    }
    Invoke-DirectPrebuiltDeploy
  }

  Assert-PosAlias -TargetHost $Domain
  Invoke-PosSmokeGates
  Write-PosDeploymentLock -DeploymentHost $script:LastPosDeploymentHost -DeploymentId $script:LastPosDeploymentId

  [ordered]@{
    status = 'ready'
    domain = $Domain
    project = $Project
    project_id = $ProjectId
    deployment_url = if ($script:LastPosDeploymentHost) { "https://$script:LastPosDeploymentHost" } else { $null }
    deployment_id = if ($script:LastPosDeploymentId) { $script:LastPosDeploymentId } else { $null }
    strict_enterprise_required = [bool]$RequireStrictEnterprise
  } | ConvertTo-Json -Depth 4
}
finally {
  Pop-Location
}

param(
  [string]$LockFile = 'tools/app_deployment_lock.json',
  [string]$Scope = 'swanhtet01s-projects',
  [switch]$Repair,
  [switch]$RunSmoke
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ResolvedLockFile = if ([System.IO.Path]::IsPathRooted($LockFile)) {
  $LockFile
} else {
  Join-Path $RepoRoot $LockFile
}

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

function Write-ResultAndExit {
  param(
    [string]$Status,
    [hashtable]$Payload,
    [int]$ExitCode
  )

  $result = [ordered]@{
    status = $Status
    checked_at = (Get-Date).ToUniversalTime().ToString('o')
  }
  foreach ($key in $Payload.Keys) {
    $result[$key] = $Payload[$key]
  }
  $result | ConvertTo-Json -Depth 8
  exit $ExitCode
}

if (-not (Test-Path -LiteralPath $ResolvedLockFile)) {
  Write-ResultAndExit -Status 'blocked' -ExitCode 1 -Payload @{
    reason = 'lock_file_missing'
    lock_file = $ResolvedLockFile
  }
}

$lock = Get-Content -Raw -LiteralPath $ResolvedLockFile | ConvertFrom-Json
$hostName = [string]$lock.app_host
$expectedDeploymentId = [string]$lock.deployment_id
$expectedDeploymentUrl = [string]$lock.deployment_url
$expectedProject = [string]$lock.project

if ($hostName -eq 'pos.supermega.dev' -and $expectedProject -ne 'spa-desk-pilot') {
  Write-ResultAndExit -Status 'blocked' -ExitCode 1 -Payload @{
    reason = 'pos_domain_owned_by_deskpos'
    host = $hostName
    locked_project = $expectedProject
    canonical_project = 'spa-desk-pilot'
    action = 'Deploy from C:\Users\swann\OneDrive - BDA\spa-desk-pilot and alias the latest spa-desk-pilot production deployment.'
  }
}

if (-not $hostName -or -not $expectedDeploymentId -or -not $expectedDeploymentUrl) {
  Write-ResultAndExit -Status 'blocked' -ExitCode 1 -Payload @{
    reason = 'lock_file_incomplete'
    lock_file = $ResolvedLockFile
  }
}

Push-Location $RepoRoot
try {
  $inspect = Invoke-NativeCapture npx @(
    '--yes',
    'vercel@53.2.0',
    'inspect',
    $hostName,
    '--local-config',
    'vercel.json',
    '--scope',
    $Scope,
    '--no-color'
  )
  if ($inspect.exit_code -ne 0) {
    Write-ResultAndExit -Status 'blocked' -ExitCode 1 -Payload @{
      reason = 'inspect_failed'
      host = $hostName
      detail = $inspect.text.Trim()
    }
  }

  $actualDeploymentId = ''
  $actualProject = ''
  if ($inspect.text -match '(?m)^id\s+([^\s]+)') {
    $actualDeploymentId = [string]$Matches[1]
  }
  if ($inspect.text -match '(?m)^name\s+([^\s]+)') {
    $actualProject = [string]$Matches[1]
  }

  $aliasOk = $actualDeploymentId -eq $expectedDeploymentId -and (-not $expectedProject -or $actualProject -eq $expectedProject)
  $repairOutput = ''
  $didRepair = $false
  if (-not $aliasOk -and $Repair) {
    $alias = Invoke-NativeCapture npx @(
      '--yes',
      'vercel@53.2.0',
      'alias',
      'set',
      $expectedDeploymentUrl,
      $hostName,
      '--local-config',
      'vercel.json',
      '--scope',
      $Scope,
      '--no-color'
    )
    $repairOutput = $alias.text.Trim()
    $didRepair = $true
    if ($alias.exit_code -ne 0) {
      Write-ResultAndExit -Status 'blocked' -ExitCode 1 -Payload @{
        reason = 'repair_failed'
        host = $hostName
        expected_deployment_id = $expectedDeploymentId
        actual_deployment_id = $actualDeploymentId
        actual_project = $actualProject
        detail = $repairOutput
      }
    }

    $inspect = Invoke-NativeCapture npx @(
      '--yes',
      'vercel@53.2.0',
      'inspect',
      $hostName,
      '--local-config',
      'vercel.json',
      '--scope',
      $Scope,
      '--no-color'
    )
    $actualDeploymentId = ''
    $actualProject = ''
    if ($inspect.text -match '(?m)^id\s+([^\s]+)') {
      $actualDeploymentId = [string]$Matches[1]
    }
    if ($inspect.text -match '(?m)^name\s+([^\s]+)') {
      $actualProject = [string]$Matches[1]
    }
    $aliasOk = $actualDeploymentId -eq $expectedDeploymentId -and (-not $expectedProject -or $actualProject -eq $expectedProject)
  }

  $loginCheck = Invoke-NativeCapture curl.exe @(
    '-sS',
    '-L',
    '--max-time',
    '30',
    '-o',
    'NUL',
    '-w',
    '%{http_code}',
    "https://$hostName/pos/login"
  )
  $loginStatus = $loginCheck.text.Trim()

  $smokePayload = $null
  $smokeExitCode = $null
  $smokeAttempts = 0
  if ($RunSmoke) {
    $smokeText = ''
    for ($attempt = 1; $attempt -le 2; $attempt++) {
      $smokeAttempts = $attempt
      if ($attempt -gt 1) {
        Start-Sleep -Seconds 8
      }
      $smoke = Invoke-NativeCapture npm @('run', 'smoke:pos-host', '--', "https://$hostName")
      $smokeExitCode = $smoke.exit_code
      $smokeText = $smoke.text
      if ($smokeExitCode -eq 0) {
        break
      }
    }
    $jsonStart = $smokeText.IndexOf('{')
    $jsonEnd = $smokeText.LastIndexOf('}')
    if ($jsonStart -ge 0 -and $jsonEnd -gt $jsonStart) {
      try {
        $smokePayload = $smokeText.Substring($jsonStart, $jsonEnd - $jsonStart + 1) | ConvertFrom-Json
      } catch {
        $smokePayload = [ordered]@{ parse_error = $true; excerpt = $smokeText.Trim().Substring(0, [Math]::Min(1200, $smokeText.Trim().Length)) }
      }
    } else {
      $smokePayload = [ordered]@{ output = $smokeText.Trim() }
    }
  }

  $ready = $aliasOk -and $loginStatus -eq '200' -and ((-not $RunSmoke) -or $smokeExitCode -eq 0)
  $status = if ($ready) { 'ready' } elseif ($Repair) { 'blocked' } else { 'drift' }
  $exitCode = if ($ready) { 0 } else { 1 }
  Write-ResultAndExit -Status $status -ExitCode $exitCode -Payload @{
    host = $hostName
    expected_project = $expectedProject
    expected_deployment_id = $expectedDeploymentId
    expected_deployment_url = $expectedDeploymentUrl
    actual_project = $actualProject
    actual_deployment_id = $actualDeploymentId
    alias_ok = $aliasOk
    repaired = $didRepair
    repair_output = $repairOutput
    login_http_status = $loginStatus
    smoke_exit_code = $smokeExitCode
    smoke_attempts = $smokeAttempts
    smoke = $smokePayload
  }
}
finally {
  Pop-Location
}

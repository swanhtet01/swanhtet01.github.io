param(
  [string]$ContractPath = (Join-Path $PSScriptRoot 'supermega_deploy_contract.json'),
  [switch]$Strict
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot

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

function ConvertFrom-CliJson {
  param([string]$Text)

  $start = $Text.IndexOf('{')
  $end = $Text.LastIndexOf('}')
  if ($start -lt 0 -or $end -lt $start) {
    throw "No JSON object was found in CLI output."
  }

  return $Text.Substring($start, $end - $start + 1) | ConvertFrom-Json
}

function Get-AliasProjectName {
  param(
    [string]$Url,
    [string[]]$ProjectNames
  )

  $cleanUrl = ($Url -replace '^https://', '') -replace '/$', ''
  foreach ($projectName in ($ProjectNames | Sort-Object Length -Descending)) {
    if ($cleanUrl -eq "$projectName.vercel.app" -or $cleanUrl.StartsWith("$projectName-")) {
      return $projectName
    }
  }

  return $null
}

function Get-InspectedProjectName {
  param([string]$Domain)

  $inspectResult = Invoke-NativeCapture npx @('vercel', 'inspect', $Domain)
  if ($inspectResult.exit_code -ne 0) {
    return $null
  }

  $match = [regex]::Match($inspectResult.text, '(?m)^\s*name\s+(?<name>\S+)\s*$')
  if (-not $match.Success) {
    return $null
  }

  return [string]$match.Groups['name'].Value
}

function Read-OptionalJsonFile {
  param([string]$PathValue)

  $candidate = $PathValue
  if (-not [System.IO.Path]::IsPathRooted($candidate)) {
    $candidate = Join-Path $RepoRoot $candidate
  }

  if (-not (Test-Path -LiteralPath $candidate)) {
    return $null
  }

  return Get-Content -Raw -LiteralPath $candidate | ConvertFrom-Json
}

if (-not (Test-Path -LiteralPath $ContractPath)) {
  throw "Deploy contract not found: $ContractPath"
}

$contract = Get-Content -Raw -LiteralPath $ContractPath | ConvertFrom-Json

$projectResult = Invoke-NativeCapture npx @('vercel', 'project', 'ls', '--format=json')
if ($projectResult.exit_code -ne 0) {
  [ordered]@{
    status = 'error'
    reason = 'vercel_project_list_failed'
    detail = $projectResult.text
  } | ConvertTo-Json -Depth 10
  exit 1
}

$aliasResult = Invoke-NativeCapture npx @('vercel', 'alias', 'ls', '--format=json', '--limit', '100')
if ($aliasResult.exit_code -ne 0) {
  [ordered]@{
    status = 'error'
    reason = 'vercel_alias_list_failed'
    detail = $aliasResult.text
  } | ConvertTo-Json -Depth 10
  exit 1
}

$projectsPayload = ConvertFrom-CliJson $projectResult.text
$aliasesPayload = ConvertFrom-CliJson $aliasResult.text
$projects = @($projectsPayload.projects)
$aliases = @($aliasesPayload.aliases)
$projectNames = @($projects | ForEach-Object { [string]$_.name })
$aliasByDomain = @{}
foreach ($alias in $aliases) {
  $aliasByDomain[[string]$alias.alias] = $alias
}

$blockers = @()
$warnings = @()
$projectRows = @()

foreach ($desired in @($contract.desired_projects)) {
  $projectName = [string]$desired.project
  $existingProject = $projects | Where-Object { [string]$_.name -eq $projectName } | Select-Object -First 1
  $projectExists = $null -ne $existingProject
  if (-not $projectExists) {
    $blockers += "missing_project:$projectName"
  }

  $domainRows = @()
  foreach ($domain in @($desired.domains)) {
    $alias = $aliasByDomain[[string]$domain]
    $currentUrl = $null
    if ($alias) {
      $currentUrl = [string]$alias.url
    }
    $currentProject = $null
    if ($currentUrl) {
      $currentProject = Get-AliasProjectName -Url $currentUrl -ProjectNames $projectNames
      if (-not $currentProject) {
        $currentProject = Get-InspectedProjectName -Domain ([string]$domain)
      }
    }
    $deploymentId = $null
    if ($alias) {
      $deploymentId = [string]$alias.deploymentId
    }
    $status = 'missing_alias'

    if ($alias -and -not $projectExists) {
      $status = 'project_missing'
    } elseif ($alias -and $currentProject -eq $projectName) {
      $status = 'ready'
    } elseif ($alias -and $currentProject) {
      $status = 'wrong_project'
    } elseif ($alias) {
      $status = 'unknown_target'
    }

    if ($status -ne 'ready') {
      $blockers += "$($desired.key):${domain}:$status"
    }

    $domainRows += [pscustomobject][ordered]@{
      domain = [string]$domain
      status = $status
      expected_project = $projectName
      current_project = $currentProject
      current_url = $currentUrl
      deployment_id = $deploymentId
    }
  }

  $projectId = $null
  if ($existingProject) {
    $projectId = [string]$existingProject.id
  }

  $projectRows += [pscustomobject][ordered]@{
    key = [string]$desired.key
    project = $projectName
    purpose = [string]$desired.purpose
    exists = $projectExists
    project_id = $projectId
    domains = @($domainRows)
    deploy_script = [string]$desired.deploy_script
    required_checks = @($desired.required_checks)
  }
}

$publicLock = Read-OptionalJsonFile -PathValue ([string]$contract.current_public_lock)
$publicLockStatus = 'not_configured'
if ($publicLock) {
  $lockedHost = [string]$publicLock.public_host
  $apex = $aliasByDomain['supermega.dev']
  $www = $aliasByDomain['www.supermega.dev']
  if ($apex -and $www -and [string]$apex.url -eq $lockedHost -and [string]$www.url -eq $lockedHost) {
    $publicLockStatus = 'ready'
  } else {
    $publicLockStatus = 'drifted'
    $warnings += 'public_alias_lock_drifted'
    $blockers += 'public_alias_lock_drifted'
  }
}

$status = 'blocked'
if ($blockers.Count -eq 0) {
  $status = 'ready'
}

$publicExpectedHost = $null
$publicApexCurrent = $null
$publicWwwCurrent = $null
if ($publicLock) {
  $publicExpectedHost = [string]$publicLock.public_host
}
if ($aliasByDomain['supermega.dev']) {
  $publicApexCurrent = [string]$aliasByDomain['supermega.dev'].url
}
if ($aliasByDomain['www.supermega.dev']) {
  $publicWwwCurrent = [string]$aliasByDomain['www.supermega.dev'].url
}

$nextCommands = @(
  'npm run deploy:separation:plan',
  'npm run vercel:alias:public'
)
if (@($blockers | Where-Object { [string]$_ -like 'pos:*' }).Count -gt 0) {
  $nextCommands += 'cd ..\..\spa-desk-pilot && npx vercel inspect https://pos.supermega.dev'
}
$nextCommands += 'npm run qa:public-live'

$payload = [ordered]@{
  status = $status
  checked_at = (Get-Date).ToUniversalTime().ToString('o')
  scope = [string]$projectsPayload.contextName
  project_count = $projects.Count
  desired_projects = @($projectRows)
  public_lock = [ordered]@{
    status = $publicLockStatus
    expected_host = $publicExpectedHost
    apex_current = $publicApexCurrent
    www_current = $publicWwwCurrent
    repair_command = 'npm run vercel:alias:public'
  }
  blockers = @($blockers)
  warnings = @($warnings)
  next_commands = @($nextCommands)
}

$payload | ConvertTo-Json -Depth 12

if ($Strict -and $status -ne 'ready') {
  exit 1
}

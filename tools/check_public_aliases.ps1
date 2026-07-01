param(
  [string]$ExpectedHost = $env:SUPERMEGA_PUBLIC_DEPLOYMENT_HOST,
  [string]$Scope = $(if ($env:VERCEL_SCOPE) { $env:VERCEL_SCOPE } else { 'swanhtet01s-projects' }),
  [int]$Attempts = 6,
  [int]$DelaySeconds = 4,
  [switch]$HttpOnly
)

$ErrorActionPreference = 'Stop'
$LockPath = Join-Path $PSScriptRoot 'public_deployment_lock.json'

function Fail {
  param([string]$Reason, [object]$Detail = $null)
  $payload = [ordered]@{
    status = 'error'
    reason = $Reason
  }
  if ($null -ne $Detail) {
    $payload.detail = $Detail
  }
  $payload | ConvertTo-Json -Depth 8
  exit 1
}

if (-not $ExpectedHost -and (Test-Path -LiteralPath $LockPath)) {
  $lock = Get-Content -LiteralPath $LockPath -Raw | ConvertFrom-Json
  $ExpectedHost = $lock.public_host
}

if ($ExpectedHost) {
  $ExpectedHost = $ExpectedHost -replace '^https://', ''
  $ExpectedHost = $ExpectedHost -replace '/$', ''
}

function Test-HttpAlias {
  param([string]$Domain)

  $response = Invoke-WebRequest `
    -Method Get `
    -Uri "https://$Domain/" `
    -UseBasicParsing `
    -MaximumRedirection 5 `
    -TimeoutSec 45 `
    -Headers @{ Accept = 'text/html'; 'User-Agent' = 'supermega-public-http-alias-check/1.0' }

  $body = [string]$response.Content
  return [pscustomobject]@{
    domain = $Domain
    status_code = [int]$response.StatusCode
    has_pivot_copy = $body.Contains('Free core tools. Premium AI workers.')
    bytes = $body.Length
  }
}

if ($HttpOnly) {
  $httpAliases = @()
  foreach ($domain in @('supermega.dev', 'www.supermega.dev')) {
    $http = Test-HttpAlias -Domain $domain
    if ($http.status_code -ne 200) {
      Fail 'public_alias_http_not_ready' $http
    }
    if (-not $http.has_pivot_copy) {
      Fail 'public_alias_pivot_copy_missing' $http
    }
    $httpAliases += $http
  }

  $api = Invoke-RestMethod `
    -Method Get `
    -Uri 'https://supermega.dev/api/contact-submissions/status' `
    -Headers @{ Accept = 'application/json'; 'User-Agent' = 'supermega-public-alias-check/1.0' }

  if ($api.status -ne 'ready') {
    Fail 'contact_api_not_ready' $api
  }

  if ($api.lead_ledger -and $api.lead_ledger -ne 'configured') {
    Fail 'lead_ledger_not_configured' $api
  }

  [ordered]@{
    status = 'ready'
    mode = 'http_only'
    aliases = $httpAliases
    expected_host = if ($ExpectedHost) { $ExpectedHost } else { $null }
    contact_api = $api.status
    lead_ledger = $api.lead_ledger
    ledger_table = $api.ledger_table
  } | ConvertTo-Json -Depth 8
  exit 0
}

function Read-DeploymentHost {
  param([string]$Domain)

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $inspectOutput = & npx vercel inspect $Domain --scope $Scope 2>&1
  $inspectExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($inspectExitCode -ne 0) {
    return [pscustomobject]@{
      domain = $Domain
      ok = $false
      error = ($inspectOutput -join "`n")
    }
  }

  $text = $inspectOutput -join "`n"
  $urlMatch = [regex]::Match($text, 'url\s+https://(?<host>[A-Za-z0-9.-]+\.vercel\.app)')
  if (-not $urlMatch.Success) {
    return [pscustomobject]@{
      domain = $Domain
      ok = $false
      error = "Could not parse deployment host from inspect output."
      inspect = $text
    }
  }

  return [pscustomobject]@{
    domain = $Domain
    ok = $true
    host = $urlMatch.Groups['host'].Value
    inspect = $text
  }
}

$lastAliases = @{}
$lastErrors = @()
for ($attempt = 1; $attempt -le [Math]::Max(1, $Attempts); $attempt += 1) {
  $lastAliases = @{}
  $lastErrors = @()
  foreach ($domain in @('supermega.dev', 'www.supermega.dev')) {
    $inspection = Read-DeploymentHost -Domain $domain
    if ($inspection.ok) {
      $lastAliases[$domain] = $inspection.host
    } else {
      $lastErrors += $inspection
    }
  }
  $hasBothAliases = $lastAliases.ContainsKey('supermega.dev') -and $lastAliases.ContainsKey('www.supermega.dev')
  $sameHost = $hasBothAliases -and ($lastAliases['supermega.dev'] -eq $lastAliases['www.supermega.dev'])
  $expectedMatch = (-not $ExpectedHost) -or ($hasBothAliases -and $lastAliases['supermega.dev'] -eq $ExpectedHost)
  if ($hasBothAliases -and $sameHost -and $expectedMatch) {
    break
  }
  if ($attempt -lt $Attempts) {
    Start-Sleep -Seconds $DelaySeconds
  }
}

$aliases = $lastAliases

foreach ($domain in @('supermega.dev', 'www.supermega.dev')) {
  if (-not $aliases.ContainsKey($domain)) {
    Fail 'missing_public_alias' @{ domain = $domain; aliases = $aliases; errors = $lastErrors }
  }
}

if ($aliases['supermega.dev'] -ne $aliases['www.supermega.dev']) {
  Fail 'public_aliases_point_to_different_hosts' $aliases
}

if ($ExpectedHost -and $aliases['supermega.dev'] -ne $ExpectedHost) {
  Fail 'public_alias_not_expected_host' @{
    expected = $ExpectedHost
    actual = $aliases['supermega.dev']
    aliases = $aliases
  }
}

$api = Invoke-RestMethod `
  -Method Get `
  -Uri 'https://supermega.dev/api/contact-submissions/status' `
  -Headers @{ Accept = 'application/json'; 'User-Agent' = 'supermega-public-alias-check/1.0' }

if ($api.status -ne 'ready') {
  Fail 'contact_api_not_ready' $api
}

if ($api.lead_ledger -and $api.lead_ledger -ne 'configured') {
  Fail 'lead_ledger_not_configured' $api
}

[ordered]@{
  status = 'ready'
  aliases = $aliases
  expected_host = if ($ExpectedHost) { $ExpectedHost } else { $null }
  scope = $Scope
  contact_api = $api.status
  lead_ledger = $api.lead_ledger
  ledger_table = $api.ledger_table
} | ConvertTo-Json -Depth 8

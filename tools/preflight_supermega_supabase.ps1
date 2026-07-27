param(
  [string]$DatabaseUrlFile = '',
  [string]$ExpectedProjectRef = '',
  [string]$SslRootCertFile = ''
)

$ErrorActionPreference = 'Stop'
$ProjectRefPattern = '^[a-z0-9]{20}$'
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$PackagePath = Join-Path $RepoRoot 'package.json'
$ValidatorPath = Join-Path $RepoRoot 'tools\validate_supermega_database_url.py'

if ($ExpectedProjectRef -notmatch $ProjectRefPattern) {
  throw 'ExpectedProjectRef must be the exact 20-character lowercase Supabase project ref.'
}

$packageState = & git -C $RepoRoot status --porcelain -- package.json 2>$null
if ($LASTEXITCODE -ne 0) {
  throw 'Could not verify the reviewed production target configuration.'
}
if ($packageState) {
  throw 'package.json has uncommitted changes; the production target guard must come from reviewed history.'
}
$package = Get-Content -Raw -LiteralPath $PackagePath | ConvertFrom-Json
$TrustedProductionProjectRef = [string]$package.supermega.productionSupabaseProjectRef
if ($TrustedProductionProjectRef -notmatch $ProjectRefPattern) {
  throw 'Configure supermega.productionSupabaseProjectRef in package.json and commit the reviewed value first.'
}
if ($ExpectedProjectRef -eq $TrustedProductionProjectRef) {
  throw 'The rehearsal target must not be the production project.'
}
if (-not (Test-Path -LiteralPath $DatabaseUrlFile -PathType Leaf)) {
  throw 'DatabaseUrlFile was not found.'
}
if (-not (Test-Path -LiteralPath $SslRootCertFile -PathType Leaf)) {
  throw 'SslRootCertFile was not found.'
}

$resolved = (Get-Content -Raw -LiteralPath $DatabaseUrlFile).Trim()
$resolvedCertificate = (Resolve-Path -LiteralPath $SslRootCertFile).Path
if (-not $resolved) {
  throw 'DatabaseUrlFile is empty.'
}
if ($resolved -notmatch '^(postgres|postgresql)://') {
  throw 'Database URL must start with postgres:// or postgresql://.'
}

$previousUrl = $env:SUPERMEGA_REHEARSAL_ADMIN_DATABASE_URL
$previousExpectedRef = $env:SUPERMEGA_REHEARSAL_PROJECT_REF
$previousProductionRef = $env:SUPERMEGA_PRODUCTION_PROJECT_REF
$previousCertificate = $env:SUPERMEGA_SUPABASE_CA_FILE

try {
  # Keep the credential out of arguments and output. The Python validator reads
  # only process-scoped values and forces every database probe read-only.
  $env:SUPERMEGA_REHEARSAL_ADMIN_DATABASE_URL = $resolved
  $env:SUPERMEGA_REHEARSAL_PROJECT_REF = $ExpectedProjectRef
  $env:SUPERMEGA_PRODUCTION_PROJECT_REF = $TrustedProductionProjectRef
  $env:SUPERMEGA_SUPABASE_CA_FILE = $resolvedCertificate

  Write-Output '==> preflight reviewed clean non-production Supabase target (read-only, verify-full)'
  & python $ValidatorPath `
    --env-key SUPERMEGA_REHEARSAL_ADMIN_DATABASE_URL `
    --rehearsal-preflight `
    --expected-project-ref-env-key SUPERMEGA_REHEARSAL_PROJECT_REF `
    --production-project-ref-env-key SUPERMEGA_PRODUCTION_PROJECT_REF `
    --ssl-root-cert-env-key SUPERMEGA_SUPABASE_CA_FILE
  if ($LASTEXITCODE -ne 0) {
    throw 'Supabase rehearsal preflight failed; no migration or hosted configuration was changed.'
  }
}
finally {
  if ($null -eq $previousUrl) {
    Remove-Item Env:SUPERMEGA_REHEARSAL_ADMIN_DATABASE_URL -ErrorAction SilentlyContinue
  }
  else {
    $env:SUPERMEGA_REHEARSAL_ADMIN_DATABASE_URL = $previousUrl
  }
  if ($null -eq $previousExpectedRef) {
    Remove-Item Env:SUPERMEGA_REHEARSAL_PROJECT_REF -ErrorAction SilentlyContinue
  }
  else {
    $env:SUPERMEGA_REHEARSAL_PROJECT_REF = $previousExpectedRef
  }
  if ($null -eq $previousProductionRef) {
    Remove-Item Env:SUPERMEGA_PRODUCTION_PROJECT_REF -ErrorAction SilentlyContinue
  }
  else {
    $env:SUPERMEGA_PRODUCTION_PROJECT_REF = $previousProductionRef
  }
  if ($null -eq $previousCertificate) {
    Remove-Item Env:SUPERMEGA_SUPABASE_CA_FILE -ErrorAction SilentlyContinue
  }
  else {
    $env:SUPERMEGA_SUPABASE_CA_FILE = $previousCertificate
  }
  $resolved = $null
  $resolvedCertificate = $null
}

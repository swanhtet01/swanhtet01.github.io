param(
  [string]$DatabaseUrlFile = '',
  [string]$StorageAuditDatabaseUrlFile = '',
  [string]$ExpectedProjectRef = '',
  [string]$ApprovalId = '',
  [switch]$ProductionHandoff,
  [switch]$Replace,
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$Scope = 'swanhtet01s-projects'
$ProjectRefPattern = '^[a-z0-9]{20}$'
$ApprovalIdPattern = '^[A-Za-z0-9][A-Za-z0-9._:-]{5,119}$'
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$PackagePath = Join-Path $RepoRoot 'package.json'
$ValidatorPath = Join-Path $RepoRoot 'tools\validate_supermega_database_url.py'

function Resolve-SecretValue {
  param(
    [string]$FilePath,
    [string]$EnvironmentKey,
    [string]$Label
  )

  if ($FilePath.Trim()) {
    if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
      throw "$Label file was not found."
    }
    $value = (Get-Content -Raw -LiteralPath $FilePath).Trim()
    if ($value) { return $value }
  }
  $environmentValue = [Environment]::GetEnvironmentVariable($EnvironmentKey, 'Process')
  if ($environmentValue) { return ([string]$environmentValue).Trim() }
  throw "Provide the $Label through its ignored file or process-scoped environment variable. Credentials are not accepted as command-line arguments."
}

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

if ($ProductionHandoff) {
  if ($ExpectedProjectRef -ne $TrustedProductionProjectRef) {
    throw 'ProductionHandoff requires the exact reviewed production Supabase project ref.'
  }
}
elseif ($ExpectedProjectRef -eq $TrustedProductionProjectRef) {
  throw 'Non-production validation must not target the reviewed production Supabase project.'
}

if (-not $ValidateOnly) {
  if (-not $ProductionHandoff) {
    throw 'Vercel mutation requires -ProductionHandoff after the isolated target has been promoted through review.'
  }
  if ($ApprovalId -notmatch $ApprovalIdPattern) {
    throw 'Vercel mutation requires a specific reviewed ApprovalId (6-120 safe characters).'
  }
}

$resolved = Resolve-SecretValue `
  -FilePath $DatabaseUrlFile `
  -EnvironmentKey 'SUPERMEGA_DATABASE_URL_TO_ACTIVATE' `
  -Label 'runtime database URL'
$resolvedStorageAudit = Resolve-SecretValue `
  -FilePath $StorageAuditDatabaseUrlFile `
  -EnvironmentKey 'SUPERMEGA_STORAGE_AUDIT_DATABASE_URL_TO_VALIDATE' `
  -Label 'read-only Storage audit database URL'
if ($resolved -notmatch '^(postgres|postgresql)://') {
  throw 'Runtime database URL must start with postgres:// or postgresql://.'
}
if ($resolvedStorageAudit -notmatch '^(postgres|postgresql)://') {
  throw 'Storage audit database URL must start with postgres:// or postgresql://.'
}

$previous = $env:SUPERMEGA_DATABASE_URL
$previousStorageAudit = $env:SUPERMEGA_STORAGE_AUDIT_DATABASE_URL
$previousExpectedRef = $env:SUPERMEGA_ACTIVATION_PROJECT_REF
try {
  # Keep credentials out of arguments and output. The validator performs only
  # read-only probes and binds both URLs to this exact reviewed project ref.
  $env:SUPERMEGA_DATABASE_URL = $resolved
  $env:SUPERMEGA_STORAGE_AUDIT_DATABASE_URL = $resolvedStorageAudit
  $env:SUPERMEGA_ACTIVATION_PROJECT_REF = $ExpectedProjectRef
  Write-Output '==> validate exact-project managed Postgres, private Storage, and SuperMega schema'
  & uv run python $ValidatorPath `
    --env-key SUPERMEGA_DATABASE_URL `
    --storage-audit-env-key SUPERMEGA_STORAGE_AUDIT_DATABASE_URL `
    --activation-target `
    --expected-project-ref-env-key SUPERMEGA_ACTIVATION_PROJECT_REF `
    --ensure-schema `
    --require-ready
  if ($LASTEXITCODE -ne 0) {
    throw 'Database validation failed; Supabase and Vercel were not changed.'
  }
  if ($ValidateOnly) {
    Write-Output '{"status":"ready","validate_only":true,"supabase_changed":false,"vercel_env_changed":false}'
    exit 0
  }

  Write-Output '==> set reviewed SUPERMEGA_DATABASE_URL for Vercel production'
  $replaceArguments = @()
  if ($Replace) { $replaceArguments += '--force' }
  $resolved | & npx.cmd --yes vercel env add SUPERMEGA_DATABASE_URL production --yes --sensitive --project megaos --scope $Scope @replaceArguments
  if ($LASTEXITCODE -ne 0) { throw 'Could not set the Vercel production variable.' }
  Write-Output '{"status":"ready","validate_only":false,"supabase_changed":false,"vercel_env_changed":true,"next_step":"Redeploy megaos and run the strict app smoke gate."}'
}
finally {
  if ($null -eq $previous) { Remove-Item Env:SUPERMEGA_DATABASE_URL -ErrorAction SilentlyContinue }
  else { $env:SUPERMEGA_DATABASE_URL = $previous }
  if ($null -eq $previousStorageAudit) { Remove-Item Env:SUPERMEGA_STORAGE_AUDIT_DATABASE_URL -ErrorAction SilentlyContinue }
  else { $env:SUPERMEGA_STORAGE_AUDIT_DATABASE_URL = $previousStorageAudit }
  if ($null -eq $previousExpectedRef) { Remove-Item Env:SUPERMEGA_ACTIVATION_PROJECT_REF -ErrorAction SilentlyContinue }
  else { $env:SUPERMEGA_ACTIVATION_PROJECT_REF = $previousExpectedRef }
  $resolved = $null
  $resolvedStorageAudit = $null
}

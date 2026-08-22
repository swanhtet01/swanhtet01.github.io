param(
  [string]$DatabaseUrlFile = '',
  [string]$StorageAuditDatabaseUrlFile = '',
  [string]$AdminDatabaseUrlFile = '',
  [string]$SupabasePublishableKeyFile = '',
  [string]$OwnerAccessTokenFile = '',
  [string]$ActivationPlanFile = '',
  [string]$ActivationReceiptFile = '',
  [string]$ExpectedProjectRef = '',
  [string]$EvidenceOutputFile = '',
  [string]$ApprovalId = '',
  [switch]$ProductionHandoff,
  [switch]$Replace,
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$Scope = 'swanhtet01s-projects'
$VercelCli = 'vercel@56.1.0'
$AppVercelProjectId = 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'
$VercelOrgId = 'team_wI4l7ZgSxcEztQPSlCCYVeJ5'
$ProjectRefPattern = '^[a-z0-9]{20}$'
$ApprovalIdPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$PackagePath = Join-Path $RepoRoot 'package.json'
$ValidatorPath = Join-Path $RepoRoot 'tools\validate_supermega_database_url.py'
$ActivationModule = 'supermega_runtime.managed_activation'
$EnvironmentValueVerifier = Join-Path $RepoRoot 'tools\verify_managed_runtime_environment_values.mjs'

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
$TrustedProductionTargetStatus = [string]$package.supermega.productionSupabaseTargetStatus
if ($TrustedProductionProjectRef -notmatch $ProjectRefPattern) {
  throw 'Configure supermega.productionSupabaseProjectRef in package.json and commit the reviewed value first.'
}
if ($TrustedProductionTargetStatus -notin @('protected-unapproved', 'activation-approved')) {
  throw 'Configure supermega.productionSupabaseTargetStatus as protected-unapproved or activation-approved and commit it first.'
}

if ($ProductionHandoff) {
  if ($ExpectedProjectRef -ne $TrustedProductionProjectRef) {
    throw 'ProductionHandoff requires the exact reviewed production Supabase project ref.'
  }
  if ($TrustedProductionTargetStatus -ne 'activation-approved') {
    throw 'ProductionHandoff is blocked until the committed Supabase target status is activation-approved.'
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
    throw 'Vercel mutation requires the exact reviewed UUID ApprovalId.'
  }
}
if ($Replace) {
  throw 'Managed activation never overwrites existing Vercel environment values. Remove or migrate them through a separate reviewed recovery change.'
}

if (-not (Test-Path -LiteralPath $ActivationPlanFile -PathType Leaf)) {
  throw 'ActivationPlanFile was not found.'
}
if (-not (Test-Path -LiteralPath $AdminDatabaseUrlFile -PathType Leaf)) {
  throw 'AdminDatabaseUrlFile was not found.'
}
if (-not $ValidateOnly -and -not (Test-Path -LiteralPath $OwnerAccessTokenFile -PathType Leaf)) {
  throw 'OwnerAccessTokenFile was not found; durable activation requires a fresh named Supabase Auth user token.'
}
$activationPlan = Get-Content -Raw -LiteralPath $ActivationPlanFile | ConvertFrom-Json
if ([string]$activationPlan.contract -ne 'supermega.managed_workspace_activation_plan.v1') {
  throw 'ActivationPlanFile does not contain the managed workspace activation contract.'
}
if ([string]$activationPlan.target.projectRef -ne $ExpectedProjectRef) {
  throw 'Activation plan and ExpectedProjectRef do not match.'
}
$activationSchemaVersion = [string]$activationPlan.target.schemaVersion
$activationReleaseCommit = ([string]$activationPlan.target.releaseCommit).Trim().ToLowerInvariant()
if ($activationSchemaVersion -ne '11') {
  throw 'Activation plan must target the reviewed managed schema version 11.'
}
if ($activationReleaseCommit -notmatch '^[0-9a-f]{40}$') {
  throw 'Activation plan must bind the exact reviewed 40-character release commit.'
}
if (-not $ValidateOnly -and [string]$activationPlan.approval.approvalId -ne $ApprovalId) {
  throw 'Activation plan and ApprovalId do not match.'
}
if (-not $ValidateOnly -and -not $ActivationReceiptFile.Trim()) {
  throw 'ActivationReceiptFile is required for an accountable production handoff.'
}

$resolved = Resolve-SecretValue `
  -FilePath $DatabaseUrlFile `
  -EnvironmentKey 'SUPERMEGA_DATABASE_URL_TO_ACTIVATE' `
  -Label 'runtime database URL'
$resolvedStorageAudit = Resolve-SecretValue `
  -FilePath $StorageAuditDatabaseUrlFile `
  -EnvironmentKey 'SUPERMEGA_STORAGE_AUDIT_DATABASE_URL_TO_VALIDATE' `
  -Label 'read-only Storage audit database URL'
$resolvedPublishableKey = Resolve-SecretValue `
  -FilePath $SupabasePublishableKeyFile `
  -EnvironmentKey 'SUPERMEGA_SUPABASE_PUBLISHABLE_KEY_TO_ACTIVATE' `
  -Label 'Supabase publishable key'
if ($resolved -notmatch '^(postgres|postgresql)://') {
  throw 'Runtime database URL must start with postgres:// or postgresql://.'
}
if ($resolvedStorageAudit -notmatch '^(postgres|postgresql)://') {
  throw 'Storage audit database URL must start with postgres:// or postgresql://.'
}
if ($resolvedPublishableKey -notmatch '^sb_publishable_[A-Za-z0-9_-]{16,}$') {
  throw 'Use an enabled modern Supabase publishable key; legacy anon and privileged keys are rejected.'
}
$supabaseUrl = "https://$ExpectedProjectRef.supabase.co"
$addedEnvironmentKeys = [System.Collections.Generic.List[string]]::new()
$workspaceActivated = $false
$activationApplyAttempted = $false

function Add-ManagedEnvironmentValue {
  param(
    [string]$Key,
    [string]$Value,
    [switch]$Sensitive
  )
  $arguments = @($VercelCli, 'env', 'add', $Key, 'production', '--yes', '--cwd', $RepoRoot, '--scope', $Scope)
  if ($Sensitive) { $arguments += '--sensitive' }
  $Value | & npx.cmd --yes @arguments
  if ($LASTEXITCODE -ne 0) { throw "Could not stage $Key without overwriting an existing value." }
  $addedEnvironmentKeys.Add($Key)
}

function Remove-StagedEnvironmentValues {
  $failures = [System.Collections.Generic.List[string]]::new()
  for ($index = $addedEnvironmentKeys.Count - 1; $index -ge 0; $index--) {
    $key = $addedEnvironmentKeys[$index]
    & npx.cmd --yes $VercelCli env rm $key production --yes --cwd $RepoRoot --scope $Scope
    if ($LASTEXITCODE -ne 0) { $failures.Add($key) }
  }
  return @($failures)
}

$previous = $env:SUPERMEGA_DATABASE_URL
$previousStorageAudit = $env:SUPERMEGA_STORAGE_AUDIT_DATABASE_URL
$previousExpectedRef = $env:SUPERMEGA_ACTIVATION_PROJECT_REF
$previousReleaseCommit = $env:SUPERMEGA_RELEASE_COMMIT
$previousVercelProjectId = $env:VERCEL_PROJECT_ID
$previousVercelOrgId = $env:VERCEL_ORG_ID
try {
  # Keep credentials out of arguments and output. The validator performs only
  # read-only probes and binds both URLs to this exact reviewed project ref.
  $env:SUPERMEGA_DATABASE_URL = $resolved
  $env:SUPERMEGA_STORAGE_AUDIT_DATABASE_URL = $resolvedStorageAudit
  $env:SUPERMEGA_ACTIVATION_PROJECT_REF = $ExpectedProjectRef
  # This value is process-scoped for preflight verification only. Vercel's
  # immutable VERCEL_GIT_COMMIT_SHA remains authoritative after deployment;
  # persisting SUPERMEGA_RELEASE_COMMIT would become stale on the next release.
  $env:SUPERMEGA_RELEASE_COMMIT = $activationReleaseCommit
  $env:VERCEL_PROJECT_ID = $AppVercelProjectId
  $env:VERCEL_ORG_ID = $VercelOrgId
  Write-Output '==> validate exact-project managed Postgres, private Storage, and SuperMega schema'
  $validatorArguments = @(
    '--env-key', 'SUPERMEGA_DATABASE_URL',
    '--storage-audit-env-key', 'SUPERMEGA_STORAGE_AUDIT_DATABASE_URL',
    '--activation-target',
    '--expected-project-ref-env-key', 'SUPERMEGA_ACTIVATION_PROJECT_REF',
    '--ensure-schema',
    '--require-ready'
  )
  if ($EvidenceOutputFile.Trim()) {
    $validatorArguments += @('--evidence-output', $EvidenceOutputFile)
  }
  & uv run python $ValidatorPath @validatorArguments
  if ($LASTEXITCODE -ne 0) {
    throw 'Database validation failed; Supabase and Vercel were not changed.'
  }
  Write-Output '==> inspect the exact managed workspace plan and durable authorization state'
  $preflightOutput = @(& uv run python -s -m $ActivationModule validate `
    --plan-file $ActivationPlanFile `
    --database-url-file $AdminDatabaseUrlFile)
  if ($LASTEXITCODE -ne 0) {
    throw 'Managed workspace activation preflight failed; Supabase and Vercel were not changed.'
  }
  $preflight = $preflightOutput[-1] | ConvertFrom-Json
  $preflightOutput | Write-Output
  if ($ValidateOnly) {
    $status = if ($preflight.ready) { 'ready' } else { [string]$preflight.status }
    [ordered]@{
      status = $status
      validate_only = $true
      durable_owner_authorization_ready = [bool]$preflight.authorizationReady
      workspace_mutated = $false
      supabase_changed = $false
      vercel_env_changed = $false
    } | ConvertTo-Json -Compress | Write-Output
    exit 0
  }

  Write-Output '==> require a clean isolated Vercel environment before recording owner authorization'
  & npx.cmd --yes $VercelCli env run --environment=production --cwd $RepoRoot --scope $Scope -- node $EnvironmentValueVerifier isolated_demo
  if ($LASTEXITCODE -ne 0) {
    throw 'Vercel already contains managed or partial managed values; use a separate reviewed recovery change.'
  }

  Write-Output '==> record named-owner authorization after Supabase Auth verifies the user token'
  & uv run python -s -m $ActivationModule authorize `
    --plan-file $ActivationPlanFile `
    --database-url-file $AdminDatabaseUrlFile `
    --confirm-owner-approval $ApprovalId `
    --production-handoff `
    --owner-access-token-file $OwnerAccessTokenFile `
    --publishable-key-file $SupabasePublishableKeyFile `
    --decision-note 'Named owner approved the exact workspace, release commit, and activation plan digest.'
  if ($LASTEXITCODE -ne 0) {
    throw 'Durable named-owner authorization failed; no workspace membership or Vercel value was changed.'
  }

  Write-Output '==> confirm authorization before staging any Vercel candidate values'
  $authorizedPreflightOutput = @(& uv run python -s -m $ActivationModule validate `
    --plan-file $ActivationPlanFile `
    --database-url-file $AdminDatabaseUrlFile)
  if ($LASTEXITCODE -ne 0) { throw 'Authorized activation preflight failed.' }
  $authorizedPreflight = $authorizedPreflightOutput[-1] | ConvertFrom-Json
  if (-not $authorizedPreflight.ready -or [string]$authorizedPreflight.status -ne 'ready_to_apply') {
    throw 'Durable authorization did not produce one clean workspace activation target.'
  }

  Write-Output '==> stage database and browser authentication values without enabling writes'
  try {
    Add-ManagedEnvironmentValue -Key 'SUPERMEGA_DATABASE_URL' -Value $resolved -Sensitive
    Add-ManagedEnvironmentValue -Key 'VITE_SUPABASE_URL' -Value $supabaseUrl
    Add-ManagedEnvironmentValue -Key 'VITE_SUPABASE_PUBLISHABLE_KEY' -Value $resolvedPublishableKey
    Add-ManagedEnvironmentValue -Key 'SUPERMEGA_TRIAL_SCHEMA_VERSION' -Value $activationSchemaVersion
    Add-ManagedEnvironmentValue -Key 'SUPERMEGA_SUPABASE_PROJECT_REF' -Value $ExpectedProjectRef
    & npx.cmd --yes $VercelCli env run --environment=production --cwd $RepoRoot --scope $Scope -- node $EnvironmentValueVerifier staged
    if ($LASTEXITCODE -ne 0) { throw 'Staged Vercel values failed value-aware verification.' }

    Write-Output '==> activate the workspace gate and exact owner membership atomically'
    $activationApplyAttempted = $true
    $activationApplyOutput = @(& uv run python -s -m $ActivationModule apply `
      --plan-file $ActivationPlanFile `
      --database-url-file $AdminDatabaseUrlFile `
      --confirm-owner-approval $ApprovalId `
      --production-handoff `
      --receipt-file $ActivationReceiptFile)
    $activationApplyExitCode = $LASTEXITCODE
    $activationApplyOutput | Write-Output
    if ($activationApplyOutput.Count -gt 0) {
      try {
        $activationApplyResult = $activationApplyOutput[-1] | ConvertFrom-Json
        if ([bool]$activationApplyResult.externalMutationPerformed) { $workspaceActivated = $true }
        if ([string]$activationApplyResult.status -eq 'active') { $workspaceActivated = $true }
      }
      catch {
        # The database reconciliation below remains authoritative.
      }
    }
    if ($activationApplyExitCode -ne 0) { throw 'Managed workspace provisioning failed.' }
    $workspaceActivated = $true

    Write-Output '==> enable managed writes last and verify effective Vercel values'
    Add-ManagedEnvironmentValue -Key 'SUPERMEGA_TRIAL_WRITES_ENABLED' -Value 'true'
    & npx.cmd --yes $VercelCli env run --environment=production --cwd $RepoRoot --scope $Scope -- node $EnvironmentValueVerifier managed_trial
    if ($LASTEXITCODE -ne 0) { throw 'Effective managed Vercel values failed verification.' }
  }
  catch {
    $failureMessage = $_.Exception.Message
    $databaseStateConfirmedSafe = -not $activationApplyAttempted
    if ($activationApplyAttempted -and -not $workspaceActivated) {
      Write-Output '==> activation command failed; reconcile PostgreSQL before deciding compensation'
      try {
        $recoveryInspectOutput = @(& uv run python -s -m $ActivationModule validate `
          --plan-file $ActivationPlanFile `
          --database-url-file $AdminDatabaseUrlFile)
        if ($LASTEXITCODE -ne 0) { throw 'Post-activation reconciliation failed.' }
        $recoveryInspect = $recoveryInspectOutput[-1] | ConvertFrom-Json
        if ([string]$recoveryInspect.status -eq 'active_replay') {
          $workspaceActivated = $true
        }
        elseif ([string]$recoveryInspect.status -in @('ready_to_apply', 'authorization_required')) {
          $databaseStateConfirmedSafe = $true
        }
      }
      catch {
        $databaseStateConfirmedSafe = $false
      }
    }
    $suspensionSucceeded = $databaseStateConfirmedSafe
    if ($workspaceActivated) {
      Write-Output '==> activation failed after workspace provisioning; suspend the workspace gate without deleting customer data'
      & uv run python -s -m $ActivationModule suspend `
        --plan-file $ActivationPlanFile `
        --database-url-file $AdminDatabaseUrlFile `
        --confirm-owner-approval $ApprovalId `
        --production-handoff `
        --receipt-file "$ActivationReceiptFile.suspended.json" `
        --suspension-approval-id ([string]$activationPlan.rollback.authorizationId) `
        --suspended-by ([string]$activationPlan.ownerActorId) `
        --reason 'Activation compensation after a downstream release gate failure.'
      $suspensionSucceeded = $LASTEXITCODE -eq 0
    }
    Write-Output '==> remove only Vercel values created by this activation attempt'
    $cleanupFailures = @(Remove-StagedEnvironmentValues)
    $recovery = [ordered]@{
      contract = 'supermega.managed_activation_recovery.v1'
      status = if ($suspensionSucceeded -and $cleanupFailures.Count -eq 0) { 'recovered' } else { 'operator_action_required' }
      activation_error = $failureMessage
      durable_authorization_retained = $true
      database_state_confirmed_safe = $suspensionSucceeded
      workspace_was_activated = $workspaceActivated
      workspace_suspended = $suspensionSucceeded
      vercel_cleanup_failures = $cleanupFailures
      customer_data_deleted = $false
      secret_values_exposed = $false
    }
    $recovery | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath "$ActivationReceiptFile.recovery.json" -Encoding utf8
    if (-not $suspensionSucceeded -or $cleanupFailures.Count -gt 0) {
      throw 'Managed activation recovery is incomplete; use the recovery receipt for operator action.'
    }
    throw "Managed activation failed and was fully compensated: $failureMessage"
  }
  Write-Output '{"status":"ready","validate_only":false,"durable_owner_authorization_ready":true,"browser_auth_ready":true,"workspace_mutated":true,"workspace_access_gate":"active","supabase_changed":true,"vercel_env_changed":true,"writes_enabled_last":true,"next_step":"Deploy a protected candidate and require exact managed-login acceptance before onboarding customer data."}'
}
finally {
  if ($null -eq $previous) { Remove-Item Env:SUPERMEGA_DATABASE_URL -ErrorAction SilentlyContinue }
  else { $env:SUPERMEGA_DATABASE_URL = $previous }
  if ($null -eq $previousStorageAudit) { Remove-Item Env:SUPERMEGA_STORAGE_AUDIT_DATABASE_URL -ErrorAction SilentlyContinue }
  else { $env:SUPERMEGA_STORAGE_AUDIT_DATABASE_URL = $previousStorageAudit }
  if ($null -eq $previousExpectedRef) { Remove-Item Env:SUPERMEGA_ACTIVATION_PROJECT_REF -ErrorAction SilentlyContinue }
  else { $env:SUPERMEGA_ACTIVATION_PROJECT_REF = $previousExpectedRef }
  if ($null -eq $previousReleaseCommit) { Remove-Item Env:SUPERMEGA_RELEASE_COMMIT -ErrorAction SilentlyContinue }
  else { $env:SUPERMEGA_RELEASE_COMMIT = $previousReleaseCommit }
  if ($null -eq $previousVercelProjectId) { Remove-Item Env:VERCEL_PROJECT_ID -ErrorAction SilentlyContinue }
  else { $env:VERCEL_PROJECT_ID = $previousVercelProjectId }
  if ($null -eq $previousVercelOrgId) { Remove-Item Env:VERCEL_ORG_ID -ErrorAction SilentlyContinue }
  else { $env:VERCEL_ORG_ID = $previousVercelOrgId }
  $resolved = $null
  $resolvedStorageAudit = $null
  $resolvedPublishableKey = $null
  $supabaseUrl = $null
  $activationSchemaVersion = $null
  $activationReleaseCommit = $null
  $addedEnvironmentKeys = $null
}

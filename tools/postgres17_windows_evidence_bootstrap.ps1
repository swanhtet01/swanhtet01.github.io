[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('Capture', 'Rehearsal')][string]$Stage,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExactSha,
  [Parameter(Mandatory = $true)][string]$RepositoryRoot,
  [Parameter(Mandatory = $true)][string]$OutputDirectory
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Fail([string]$Code) { throw $Code }
function Read-Json([string]$Path) {
  if (-not [System.IO.Path]::IsPathFullyQualified($Path)) { Fail 'bootstrap_path_not_absolute' }
  $item = Get-Item -LiteralPath $Path -Force
  if ($item.LinkType -or $item.PSIsContainer -or $item.Length -lt 1) { Fail 'bootstrap_input_file_invalid' }
  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
}
function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([Convert]::ToHexString($sha.ComputeHash($stream))).ToLowerInvariant() }
    finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
}
function Download-Exact([Uri]$Uri, [string]$Path, [int64]$Bytes, [string]$Sha256) {
  if ($Uri.Scheme -ne 'https' -or $Uri.Fragment -or $Uri.Query) { Fail 'bootstrap_source_url_invalid' }
  $client = [System.Net.Http.HttpClient]::new()
  try { [System.IO.File]::WriteAllBytes($Path, $client.GetByteArrayAsync($Uri).GetAwaiter().GetResult()) }
  finally { $client.Dispose() }
  $item = Get-Item -LiteralPath $Path -Force
  if ($item.LinkType -or $item.PSIsContainer -or $item.Length -ne $Bytes
    -or (Get-Sha256 $Path) -ne $Sha256) { Fail 'bootstrap_source_identity_mismatch' }
}
function Assert-NoAmbientOverrides {
  foreach ($name in @('PYTHONPATH', 'PYTHONHOME', 'NODE_PATH', 'GIT_CONFIG', 'GIT_CONFIG_COUNT',
      'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSERVICE',
      'PGSERVICEFILE', 'CL', '_CL_', 'LINK')) {
    if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name, 'Process'))) {
      Fail "bootstrap_ambient_override_rejected_$name"
    }
  }
  $env:PATH = 'C:\Windows\System32;C:\Windows'
}
function Assert-ExactRepository([string]$Root, [string]$ExpectedSha) {
  $git = 'C:\Program Files\Git\cmd\git.exe'
  if (-not [System.IO.File]::Exists($git)) { Fail 'bootstrap_git_missing' }
  $head = (& $git -C $Root rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $head -ne $ExpectedSha) { Fail 'bootstrap_source_head_mismatch' }
  $dirty = @(& $git -C $Root status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0 -or $dirty.Count -ne 0) { Fail 'bootstrap_source_tree_dirty' }
}
function Assert-BootstrapPolicy($Policy) {
  if ($Policy.contract -ne 'supermega.postgres17-windows-bootstrap-policy.v1'
    -or $Policy.platform.os -ne 'windows' -or $Policy.platform.arch -ne 'x64'
    -or $Policy.platform.runner -ne 'windows-2025'
    -or $Policy.installer.url -ne 'https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64.exe'
    -or $Policy.installer.fileName -ne 'postgresql-17.11-5-windows-x64.exe'
    -or $Policy.installer.bytes -ne 413001200
    -or $Policy.installer.sha256 -ne '612c7f5400a003aaffa0372cb273eed52278f93c680ab911eb9cb2229e329072'
    -or $Policy.execution.mode -ne 'extract-only'
    -or $Policy.execution.serviceInstallationAllowed -ne $false
    -or $Policy.execution.systemPathMutationAllowed -ne $false
    -or $Policy.execution.interactiveUiAllowed -ne $false
    -or $Policy.trustedBoundary.singlePurposeEphemeralRunner -ne $true
    -or $Policy.trustedBoundary.concurrentSameUserWorkloadsAllowed -ne $false
    -or $Policy.trustedBoundary.interactiveUsersAllowed -ne $false
    -or $Policy.trustedBoundary.hostileSameUserMutationInScope -ne $false) { Fail 'bootstrap_policy_invalid' }
  $expected = @('--extract-only', '1', '--mode', 'unattended', '--unattendedmodeui', 'none',
    '--prefix', '{runtimeRoot}', '--install_runtimes', '0', '--create_shortcuts', '0')
  if ((ConvertTo-Json @($Policy.execution.arguments) -Compress) -ne
      (ConvertTo-Json $expected -Compress)) { Fail 'bootstrap_installer_arguments_invalid' }
}
function Assert-SanitizedJson([string]$Path) {
  $item = Get-Item -LiteralPath $Path -Force
  if ($item.LinkType -or $item.PSIsContainer -or $item.Length -lt 2 -or $item.Length -gt 1048576) {
    Fail 'bootstrap_evidence_size_invalid'
  }
  $text = [System.IO.File]::ReadAllText($Path)
  foreach ($forbidden in @('postgres(?:ql)?://', 'C:\\Users\\', 'runneradmin',
      '"(?:password|connectionString|rowContents)"\s*:')) {
    if ($text -match $forbidden) { Fail 'bootstrap_evidence_not_sanitized' }
  }
}
function Assert-ExactProperties($Value, [string[]]$Expected) {
  $actual = @($Value.PSObject.Properties.Name | Sort-Object)
  $wanted = @($Expected | Sort-Object)
  if ((Compare-Object $actual $wanted).Count -ne 0) { Fail 'bootstrap_closure_inventory_invalid' }
}
function Assert-BoundedId($Value) {
  if ($Value -isnot [string] -or $Value -notmatch '^[a-z0-9][a-z0-9._-]{0,127}$') {
    Fail 'bootstrap_closure_inventory_invalid'
  }
}
function Assert-Integer($Value, [long]$Minimum, [long]$Maximum) {
  if (-not ($Value -is [int] -or $Value -is [long]) -or $Value -lt $Minimum -or $Value -gt $Maximum) {
    Fail 'bootstrap_closure_inventory_invalid'
  }
}

$root = [System.IO.Path]::GetFullPath($RepositoryRoot)
$output = [System.IO.Path]::GetFullPath($OutputDirectory)
Assert-NoAmbientOverrides
Assert-ExactRepository $root $ExactSha
$policy = Read-Json (Join-Path $root 'hq\research\postgres17-windows-bootstrap-policy.json')
Assert-BootstrapPolicy $policy
$publisherPolicy = Read-Json (Join-Path $root $policy.installer.publisherPolicyPath)
$profile = Read-Json (Join-Path $root 'hq\research\postgres17-toolchain-profile.json')
$registryPolicyPath = Join-Path $root 'hq\research\postgres17-official-source-policy.json'
$registryPolicy = Read-Json $registryPolicyPath
if ($profile.runtimeRootName -ne [System.IO.Path]::GetFileName($profile.runtimeRootName)
  -or [string]::IsNullOrWhiteSpace($profile.runtimeRootName)) { Fail 'bootstrap_runtime_root_name_invalid' }

$userProfile = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
if ([string]::IsNullOrWhiteSpace($userProfile)) { Fail 'bootstrap_user_profile_missing' }
$workRoot = Join-Path $userProfile '.cache\supermega-postgresql'
$runtimeRoot = Join-Path $workRoot $profile.runtimeRootName
$downloadPath = Join-Path $workRoot $policy.installer.fileName
$observerEvidencePath = Join-Path $workRoot 'observer-evidence.json'
$closureOutputPath = Join-Path $output 'postgres17-stage2-closure.json'
$candidatePath = Join-Path $output 'postgres17-stage1-candidate.json'
$cleanupPath = Join-Path $output 'postgres17-stage2-cleanup.json'
$receiptPath = Join-Path $output 'postgres17-rehearsal.json'
$rawReceiptPath = $receiptPath + '.raw.json'
$serviceBefore = @(); $serviceAfter = @(); $ownedWorkRoot = $false
$observation = $null; $closure = $null; $closureEvidenceSha256 = $null
try {
  if ([System.IO.Directory]::Exists($workRoot) -or [System.IO.File]::Exists($workRoot)) {
    Fail 'bootstrap_workspace_not_fresh'
  }
  [System.IO.Directory]::CreateDirectory($workRoot) | Out-Null
  [System.IO.Directory]::CreateDirectory($output) | Out-Null
  $ownedWorkRoot = $true
  $serviceBefore = @(Get-Service | Select-Object -ExpandProperty Name | Sort-Object)
  Download-Exact ([Uri]$policy.installer.url) $downloadPath ([int64]$policy.installer.bytes) $policy.installer.sha256
  $env:SUPERMEGA_AUTHENTICODE_TARGET = $downloadPath
  $inspector = Join-Path $root 'tools\inspect_windows_authenticode.ps1'
  $observationText = & 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' `
    -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $inspector
  if ($LASTEXITCODE -ne 0) { Fail 'bootstrap_authenticode_inspection_failed' }
  $observation = $observationText | ConvertFrom-Json
  if ($observation.artifactBytes -ne $policy.installer.bytes
    -or $observation.artifactSha256 -ne $policy.installer.sha256
    -or $observation.signatureStatus -ne 'Valid' -or $observation.signatureType -ne 'Authenticode'
    -or $observation.signerCertificateSha256 -ne '558b34d97944a53cefc13c031ea46845be00f0b9bb87f47dc3110eaee07f82d3'
    -or $observation.timestampCertificateSha256 -ne '2da09da7f4131f9fe72db6c5e6e9c9656755af043f1ea742cc0d2120e141ebfc'
    -or @($observation.ekuOids) -notcontains '1.3.6.1.5.5.7.3.3') {
    Fail 'bootstrap_authenticode_identity_mismatch'
  }
  if ($Stage -eq 'Rehearsal') {
    if ($policy.status -ne 'reviewed' -or $policy.approval.status -ne 'reviewed'
      -or $publisherPolicy.status -ne 'reviewed' -or $publisherPolicy.approval.status -ne 'reviewed'
      -or $registryPolicy.status -ne 'reviewed' -or $registryPolicy.approval.status -ne 'reviewed'
      -or $profile.status -ne 'reviewed' -or $profile.approval.status -ne 'reviewed'
      -or $profile.loadClosureComplete -ne $true -or $profile.loadClosure.status -ne 'reviewed') {
      Fail 'bootstrap_stage2_authority_unapproved'
    }
    if (@($publisherPolicy.approvedSigners.certificateSha256) -notcontains $observation.signerCertificateSha256
      -or @($publisherPolicy.approvedTimestampCertificateSha256) -notcontains $observation.timestampCertificateSha256
      -or @($publisherPolicy.requiredEkuOids) -notcontains '1.3.6.1.5.5.7.3.3') {
      Fail 'bootstrap_publisher_identity_unapproved'
    }
    if ($policy.closureObserver.status -ne 'reviewed'
      -or $policy.closureObserver.captureMethod -ne 'windows-kernel-process-image-events-v1'
      -or $policy.closureObserver.requiresCaptureBeforeSpawn -ne $true
      -or $policy.closureObserver.requiresDroppedEvents -ne 0
      -or $policy.closureObserver.requiresCompleteDescendantCorrelation -ne $true
      -or [string]::IsNullOrWhiteSpace($policy.closureObserver.command)
      -or $policy.closureObserver.sha256 -notmatch '^[0-9a-f]{64}$') {
      Fail 'bootstrap_closure_observer_unapproved'
    }
    foreach ($component in @('python', 'psycopg', 'openssl', 'node', 'git')) {
      if (@($registryPolicy.artifacts | Where-Object { $_.component -eq $component }).Count -lt 1) {
        Fail "bootstrap_registry_component_missing_$component"
      }
    }
    foreach ($artifact in @($registryPolicy.artifacts)) {
      $artifactUri = [Uri]$artifact.artifactUrl; $metadataUri = [Uri]$artifact.metadataUrl
      if ($artifactUri.Host -ne $artifact.artifactHost -or $metadataUri.Host -ne $artifact.metadataHost
        -or $artifact.fileName -ne [System.IO.Path]::GetFileName($artifact.fileName)) {
        Fail 'bootstrap_registry_source_invalid'
      }
      Download-Exact $artifactUri (Join-Path $workRoot $artifact.fileName) ([int64]$artifact.bytes) $artifact.sha256
      Download-Exact $metadataUri (Join-Path $workRoot ($artifact.sourceId + '.metadata')) `
        ([int64]$artifact.metadataBytes) $artifact.metadataSha256
    }
    $observer = [System.IO.Path]::GetFullPath((Join-Path $root $policy.closureObserver.command))
    if (-not $observer.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar,
        [StringComparison]::OrdinalIgnoreCase)) { Fail 'bootstrap_closure_observer_path_escape' }
    $observerItem = Get-Item -LiteralPath $observer -Force
    if ($observerItem.LinkType -or $observerItem.PSIsContainer
      -or (Get-Sha256 $observer) -ne $policy.closureObserver.sha256) {
      Fail 'bootstrap_closure_observer_identity_mismatch'
    }
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo.FileName = $observer
    $process.StartInfo.UseShellExecute = $false; $process.StartInfo.CreateNoWindow = $true
    foreach ($argument in @('--capture-before-spawn', '--output', $observerEvidencePath,
      '--stage', 'rehearsal', '--exact-sha', $ExactSha, '--installer', $downloadPath,
      '--runtime-root', $runtimeRoot, '--source-root', $workRoot,
      '--registry-policy', $registryPolicyPath,
      '--recorder', (Join-Path $root 'tools\record_postgres17_rehearsal.mjs'),
      '--receipt', $receiptPath, '--', '--extract-only', '1', '--mode', 'unattended',
      '--unattendedmodeui', 'none', '--prefix', $runtimeRoot,
      '--install_runtimes', '0', '--create_shortcuts', '0')) {
      $process.StartInfo.ArgumentList.Add([string]$argument)
    }
    if (-not $process.Start()) { Fail 'bootstrap_observer_start_failed' }
    if (-not $process.WaitForExit(900000)) { $process.Kill($true); Fail 'bootstrap_observer_timeout' }
    if ($process.ExitCode -ne 0) { Fail 'bootstrap_observer_failed' }
    if (-not [System.IO.File]::Exists($observerEvidencePath)) { Fail 'bootstrap_closure_evidence_missing' }
    $closure = Read-Json $observerEvidencePath
    $receipt = Read-Json $receiptPath
    $closureEvidenceSha256 = Get-Sha256 $observerEvidencePath
    if ($closure.contract -ne 'supermega.windows-process-image-observer.v1'
      -or $closure.exactSha -ne $ExactSha
      -or $closure.captureStartedBeforeSpawn -ne $true -or $closure.rehearsalObserved -ne $true
      -or $closure.droppedEvents -ne 0 -or $closure.descendantCorrelationComplete -ne $true
      -or $closure.runtimeModulesComplete -ne $true -or $closure.processTreeComplete -ne $true
      -or $closure.allProcessesExited -ne $true -or $closure.serviceInventoryUnchanged -ne $true
      -or $closure.allSelectedPortsClosed -ne $true -or @($closure.selectedPorts).Count -lt 1
      -or $closure.temporaryDataRemoved -ne $true
      -or -not [System.IO.File]::Exists($receiptPath)
      -or -not [System.IO.File]::Exists($rawReceiptPath)
      -or $closure.profileId -ne $receipt.engine.toolchain.profileId
      -or $closure.runtimeClosureEvidenceSha256 -ne $receipt.engine.toolchain.loadClosureEvidenceSha256
      -or $closure.sourceDigest -ne $receipt.engine.toolchain.sourceDigest
      -or $closure.bindingDigest -ne $receipt.engine.toolchain.bindingDigest
      -or $closure.receiptSha256 -ne (Get-Sha256 $receiptPath)
      -or $closure.rawReceiptSha256 -ne (Get-Sha256 $rawReceiptPath)) {
      Fail 'bootstrap_closure_evidence_incomplete'
    }
    if (@($closure.processes).Count -lt 1 -or @($closure.runtimeFiles).Count -lt 1
      -or @($closure.systemModules).Count -lt 1
      -or @($closure.processes).Count -ne [int]$closure.processCount
      -or @($closure.runtimeFiles).Count -ne [int]$closure.runtimeFileCount
      -or @($closure.systemModules).Count -ne [int]$closure.systemModuleCount) {
      Fail 'bootstrap_closure_inventory_incomplete'
    }
    $ports = @($closure.selectedPorts)
    if (@($ports | Where-Object { -not ($_ -is [int] -or $_ -is [long]) -or $_ -lt 1 -or $_ -gt 65535 }).Count -ne 0
      -or @($ports | Sort-Object -Unique).Count -ne $ports.Count) {
      Fail 'bootstrap_closure_inventory_invalid'
    }
    $allowedClosureKeys = @('contract', 'exactSha', 'captureStartedBeforeSpawn',
      'rehearsalObserved', 'droppedEvents', 'descendantCorrelationComplete',
      'runtimeModulesComplete', 'processTreeComplete', 'allProcessesExited',
      'serviceInventoryUnchanged', 'allSelectedPortsClosed', 'selectedPorts',
      'temporaryDataRemoved', 'profileId', 'runtimeClosureEvidenceSha256',
      'sourceDigest', 'bindingDigest', 'receiptSha256', 'rawReceiptSha256',
      'processCount', 'runtimeFileCount', 'systemModuleCount',
      'processes', 'runtimeFiles', 'systemModules')
    Assert-ExactProperties $closure $allowedClosureKeys
    Assert-Integer $closure.processCount 1 10000
    Assert-Integer $closure.runtimeFileCount 1 10000
    Assert-Integer $closure.systemModuleCount 1 10000
    foreach ($processRecord in @($closure.processes)) {
      $allowedProcessKeys = @('sequence', 'parentSequence', 'imageBindingId', 'sourceId', 'exitCode')
      Assert-ExactProperties $processRecord $allowedProcessKeys
      Assert-Integer $processRecord.sequence 0 1000000
      if ($null -ne $processRecord.parentSequence) { Assert-Integer $processRecord.parentSequence 0 1000000 }
      Assert-Integer $processRecord.exitCode 0 0
      Assert-BoundedId $processRecord.imageBindingId
      Assert-BoundedId $processRecord.sourceId
    }
    foreach ($file in @($closure.runtimeFiles)) {
      $allowedRuntimeKeys = @('bindingId', 'sourceId', 'relativePath', 'bytes', 'sha256', 'uses')
      Assert-ExactProperties $file $allowedRuntimeKeys
      Assert-BoundedId $file.bindingId
      Assert-BoundedId $file.sourceId
      Assert-Integer $file.bytes 1 1099511627776
      if ($file.relativePath -isnot [string] -or [string]::IsNullOrWhiteSpace($file.relativePath)
        -or [System.IO.Path]::IsPathFullyQualified($file.relativePath)
        -or $file.relativePath.StartsWith('/') -or $file.relativePath.StartsWith('\')
        -or $file.relativePath.Contains(':')
        -or @($file.relativePath -split '[\\/]' | Where-Object { $_ -in @('', '.', '..') }).Count -ne 0
        -or $file.sha256 -notmatch '^[0-9a-f]{64}$'
        -or @($file.uses).Count -lt 1
        -or @($file.uses | Sort-Object -Unique).Count -ne @($file.uses).Count
        -or @($file.uses | Where-Object { $_ -notin @('executed', 'imported', 'loaded') }).Count -ne 0) {
        Fail 'bootstrap_closure_inventory_invalid'
      }
    }
    foreach ($module in @($closure.systemModules)) {
      $allowedSystemKeys = @('fileName', 'bytes', 'sha256')
      Assert-ExactProperties $module $allowedSystemKeys
      Assert-Integer $module.bytes 1 1099511627776
      if ($module.fileName -isnot [string]
        -or $module.fileName -notmatch '^[A-Za-z0-9][A-Za-z0-9._+-]{0,255}$'
        -or $module.fileName -ne [System.IO.Path]::GetFileName($module.fileName)
        -or $module.sha256 -notmatch '^[0-9a-f]{64}$') {
        Fail 'bootstrap_closure_inventory_invalid'
      }
    }
    Assert-SanitizedJson $receiptPath; Assert-SanitizedJson $rawReceiptPath
    Copy-Item -LiteralPath $observerEvidencePath -Destination $closureOutputPath
    Assert-SanitizedJson $closureOutputPath
  }
} finally {
  Remove-Item Env:\SUPERMEGA_AUTHENTICODE_TARGET -ErrorAction SilentlyContinue
  if ($ownedWorkRoot -and [System.IO.Directory]::Exists($workRoot)) {
    Remove-Item -LiteralPath $workRoot -Recurse -Force
  }
  $serviceAfter = @(Get-Service | Select-Object -ExpandProperty Name | Sort-Object)
  if ((Compare-Object $serviceBefore $serviceAfter).Count -ne 0) { Fail 'bootstrap_service_cleanup_failed' }
  if ($ownedWorkRoot -and [System.IO.Directory]::Exists($workRoot)) { Fail 'bootstrap_data_cleanup_failed' }
}

if ($Stage -eq 'Capture') {
  [ordered]@{
    contract = 'supermega.postgres17-stage1-candidate.v1'; authoritative = $false
    exactSha = $ExactSha; installer = $observation
    documentation = [ordered]@{ url = $policy.execution.authoritativeDocumentationUrl; sha256 = $policy.execution.authoritativeDocumentationSha256 }
    executionPerformed = $false; databaseRehearsalReceiptCreated = $false
    cleanup = [ordered]@{ serviceInventoryUnchanged = $true; temporaryDataRemoved = $true; processOrPortCheckApplicable = $false }
    secretValuesExposed = $false
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $candidatePath -Encoding UTF8NoBOM
  Assert-SanitizedJson $candidatePath
} else {
  [ordered]@{
    contract = 'supermega.postgres17-stage2-cleanup.v1'; authoritative = $false
    exactSha = $ExactSha; serviceInventoryUnchanged = $true; allSelectedPortsClosed = $true
    selectedPortCount = @($closure.selectedPorts).Count; temporaryDataRemoved = $true
    allProcessesExited = $true; closureEvidenceSha256 = $closureEvidenceSha256
    receiptSha256 = $closure.receiptSha256; rawReceiptSha256 = $closure.rawReceiptSha256
    receiptReconstructionRawRetained = $true; secretValuesExposed = $false
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $cleanupPath -Encoding UTF8NoBOM
  Assert-SanitizedJson $cleanupPath
}

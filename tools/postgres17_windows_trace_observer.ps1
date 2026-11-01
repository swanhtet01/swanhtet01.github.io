[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('Probe')][string]$Mode,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExactSha,
  [Parameter(Mandatory = $true)][string]$RepositoryRoot,
  [Parameter(Mandatory = $true)][string]$OutputDirectory
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Fail([string]$Code) { throw $Code }
function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([Convert]::ToHexString($sha.ComputeHash($stream))).ToLowerInvariant() }
    finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
}
function Get-CanonicalTextSha256([string]$Path) {
  $text = [System.IO.File]::ReadAllText($Path)
  $text = $text.Replace("`r`n", "`n")
  if ($text.Contains("`r") -or $text.Contains([char]0)) {
    Fail 'observer_probe_source_text_invalid'
  }
  $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return ([Convert]::ToHexString($sha.ComputeHash($bytes))).ToLowerInvariant() }
  finally { $sha.Dispose() }
}
function Read-RegularJson([string]$Path) {
  $item = Get-Item -LiteralPath $Path -Force
  if ($item.LinkType -or $item.PSIsContainer -or $item.Length -lt 2 -or $item.Length -gt 1048576) {
    Fail 'observer_probe_policy_invalid'
  }
  return ([System.IO.File]::ReadAllText($Path) | ConvertFrom-Json)
}
function Assert-RegularFile([string]$Path, [string]$Code) {
  if (-not [System.IO.File]::Exists($Path)) { Fail $Code }
  $item = Get-Item -LiteralPath $Path -Force
  if ($item.LinkType -or $item.PSIsContainer -or $item.Length -lt 1) { Fail $Code }
  return $item
}
function Inspect-SignedTool([string]$Path, [string]$Inspector, [string]$RequiredOrganization) {
  $env:SUPERMEGA_AUTHENTICODE_TARGET = $Path
  try {
    $text = & 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' `
      -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $Inspector
    if ($LASTEXITCODE -ne 0) { Fail 'observer_probe_tool_signature_invalid' }
  } finally {
    Remove-Item Env:\SUPERMEGA_AUTHENTICODE_TARGET -ErrorAction SilentlyContinue
  }
  $observation = $text | ConvertFrom-Json
  $organizationPattern = '(^|, )O=' + [Regex]::Escape($RequiredOrganization) + '(,|$)'
  if ($observation.signatureStatus -ne 'Valid'
    -or $observation.signatureType -ne 'Authenticode'
    -or @($observation.ekuOids) -notcontains '1.3.6.1.5.5.7.3.3'
    -or $observation.signerSubject -notmatch $organizationPattern
    -or $observation.artifactSha256 -ne (Get-Sha256 $Path)) {
    Fail 'observer_probe_tool_signature_invalid'
  }
  return [ordered]@{
    fileName = [System.IO.Path]::GetFileName($Path)
    bytes = [int64]$observation.artifactBytes
    sha256 = $observation.artifactSha256
    signatureStatus = $observation.signatureStatus
    signerCertificateSha256 = $observation.signerCertificateSha256
  }
}
function Try-ReadLossCounter([string]$Text, [string]$Name) {
  $escaped = [Regex]::Escape($Name)
  foreach ($pattern in @(
      "(?im)^\s*$escaped\s*[:=]\s*(\d+)\s*$",
      "(?is)<$escaped>\s*(\d+)\s*</$escaped>")) {
    $match = [Regex]::Match($Text, $pattern)
    if ($match.Success) { return [int64]$match.Groups[1].Value }
  }
  return $null
}
function Assert-SanitizedEvidence([string]$Path) {
  $item = Get-Item -LiteralPath $Path -Force
  if ($item.LinkType -or $item.PSIsContainer -or $item.Length -lt 2 -or $item.Length -gt 1048576) {
    Fail 'observer_probe_evidence_size_invalid'
  }
  $text = [System.IO.File]::ReadAllText($Path)
  foreach ($forbidden in @('postgres(?:ql)?://', 'C:\\Users\\', 'runneradmin',
      '"(?:password|connectionString|rowContents)"\s*:')) {
    if ($text -match $forbidden) { Fail 'observer_probe_evidence_not_sanitized' }
  }
}

if ($Mode -ne 'Probe') { Fail 'observer_probe_mode_invalid' }
$root = [System.IO.Path]::GetFullPath($RepositoryRoot)
$output = [System.IO.Path]::GetFullPath($OutputDirectory)
$policyPath = Join-Path $root 'hq\research\postgres17-windows-bootstrap-policy.json'
$policy = Read-RegularJson $policyPath
$probePolicy = $policy.closureObserver.capabilityProbe
if ($null -eq $probePolicy -or $probePolicy.status -ne 'source-only'
  -or $probePolicy.contract -ne 'supermega.windows-process-image-observer-probe.v1'
  -or $probePolicy.captureMethod -ne 'windows-wpr-etw-process-image-probe-v1'
  -or $probePolicy.authoritative -ne $false
  -or $probePolicy.wprPath -ne 'C:\Windows\System32\wpr.exe'
  -or $probePolicy.tracerptPath -ne 'C:\Windows\System32\tracerpt.exe'
  -or $probePolicy.probeExecutablePath -ne 'C:\Windows\System32\where.exe'
  -or $probePolicy.requiredSignerOrganization -ne 'Microsoft Corporation'
  -or $probePolicy.requiresEventsLost -ne 0 -or $probePolicy.requiresBuffersLost -ne 0
  -or $probePolicy.requiresProcessEvent -ne $true
  -or $probePolicy.requiresImageEvent -ne $true
  -or $probePolicy.requiresProcessEndEvent -ne $true
  -or $probePolicy.requiresStableProcessKey -ne $true
  -or $probePolicy.requiresDrain -ne $true) {
  Fail 'observer_probe_policy_invalid'
}
$scriptPath = [System.IO.Path]::GetFullPath($PSCommandPath)
$expectedScript = [System.IO.Path]::GetFullPath((Join-Path $root $probePolicy.scriptPath))
$profilePath = [System.IO.Path]::GetFullPath((Join-Path $root $probePolicy.profilePath))
$parserPath = [System.IO.Path]::GetFullPath((Join-Path $root $probePolicy.parserPath))
if ($scriptPath -ne $expectedScript
  -or (Get-CanonicalTextSha256 $scriptPath) -ne $probePolicy.scriptSha256
  -or (Get-CanonicalTextSha256 $profilePath) -ne $probePolicy.profileSha256
  -or (Get-CanonicalTextSha256 $parserPath) -ne $probePolicy.parserSha256) {
  Fail 'observer_probe_source_identity_mismatch'
}
$git = 'C:\Program Files\Git\cmd\git.exe'
Assert-RegularFile $git 'observer_probe_git_missing' | Out-Null
$head = (& $git -C $root rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $ExactSha) { Fail 'observer_probe_source_head_mismatch' }
$dirty = @(& $git -C $root status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0 -or $dirty.Count -ne 0) { Fail 'observer_probe_source_tree_dirty' }

$wpr = $probePolicy.wprPath
$tracerpt = $probePolicy.tracerptPath
$probeExecutable = $probePolicy.probeExecutablePath
$inspector = Join-Path $root 'tools\inspect_windows_authenticode.ps1'
Assert-RegularFile $wpr 'observer_probe_wpr_missing' | Out-Null
Assert-RegularFile $tracerpt 'observer_probe_tracerpt_missing' | Out-Null
Assert-RegularFile $probeExecutable 'observer_probe_executable_missing' | Out-Null
Assert-RegularFile $inspector 'observer_probe_inspector_missing' | Out-Null
Assert-RegularFile $parserPath 'observer_probe_parser_missing' | Out-Null
$nodePaths = @(Get-Command node.exe -CommandType Application -All -ErrorAction Stop |
  ForEach-Object { [System.IO.Path]::GetFullPath($_.Source) } | Select-Object -Unique)
if ($nodePaths.Count -ne 1) { Fail 'observer_probe_node_ambiguous' }
$node = $nodePaths[0]
Assert-RegularFile $node 'observer_probe_node_invalid' | Out-Null
$tools = [ordered]@{
  wpr = Inspect-SignedTool $wpr $inspector $probePolicy.requiredSignerOrganization
  tracerpt = Inspect-SignedTool $tracerpt $inspector $probePolicy.requiredSignerOrganization
  probe = Inspect-SignedTool $probeExecutable $inspector $probePolicy.requiredSignerOrganization
}

$workRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("supermega-wpr-probe-" + [Guid]::NewGuid().ToString('N'))
$tracePath = Join-Path $workRoot 'probe.etl'
$traceXmlPath = Join-Path $workRoot 'probe.xml'
$summaryPath = Join-Path $workRoot 'summary.txt'
$copiedProbePath = Join-Path $workRoot 'supermega-observer-probe.exe'
$traceStarted = $false; $traceStopped = $false; $parsed = $false
$eventsLost = $null; $buffersLost = $null
$processObserved = $false; $imageObserved = $false; $probeExitCode = $null
$cleanupComplete = $false
try {
  [System.IO.Directory]::CreateDirectory($workRoot) | Out-Null
  [System.IO.Directory]::CreateDirectory($output) | Out-Null
  [System.IO.File]::Copy($probeExecutable, $copiedProbePath, $false)
  & $wpr -start "$profilePath!SuperMegaProcessImage" -filemode
  if ($LASTEXITCODE -ne 0) { Fail 'observer_probe_trace_start_failed' }
  $traceStarted = $true
  $probeProcess = Start-Process -FilePath $copiedProbePath `
    -ArgumentList @('/Q', 'C:\Windows\System32\where.exe') `
    -NoNewWindow -PassThru -Wait
  $probeExitCode = [int]$probeProcess.ExitCode
  if ($probeExitCode -ne 0) { Fail 'observer_probe_process_failed' }
  & $wpr -stop $tracePath
  if ($LASTEXITCODE -ne 0) { Fail 'observer_probe_trace_stop_failed' }
  $traceStopped = $true; $traceStarted = $false
  Assert-RegularFile $tracePath 'observer_probe_trace_missing' | Out-Null
  & $tracerpt $tracePath -of XML -o $traceXmlPath -summary $summaryPath -y
  if ($LASTEXITCODE -ne 0) { Fail 'observer_probe_trace_parse_failed' }
  $parsed = $true
  $summaryText = [System.IO.File]::ReadAllText($summaryPath)
  $eventsLost = Try-ReadLossCounter $summaryText 'EventsLost'
  if ($eventsLost -eq $null) { $eventsLost = Try-ReadLossCounter $summaryText 'Events Lost' }
  $buffersLost = Try-ReadLossCounter $summaryText 'BuffersLost'
  if ($buffersLost -eq $null) { $buffersLost = Try-ReadLossCounter $summaryText 'Buffers Lost' }
  if ($eventsLost -eq $null -or $buffersLost -eq $null) {
    Fail 'observer_probe_loss_counter_unavailable'
  }
  if ($eventsLost -ne 0 -or $buffersLost -ne 0) { Fail 'observer_probe_trace_loss_detected' }
  $correlationText = & $node $parserPath $traceXmlPath $copiedProbePath
  if ($LASTEXITCODE -ne 0) { Fail 'observer_probe_trace_correlation_failed' }
  $correlation = $correlationText | ConvertFrom-Json
  $correlationProperties = @($correlation.PSObject.Properties.Name | Sort-Object)
  $expectedCorrelationProperties = @('contract', 'imageEventObserved',
    'processEndObserved', 'processEventObserved', 'stableProcessKeyObserved') | Sort-Object
  if (($correlationProperties -join "`0") -ne ($expectedCorrelationProperties -join "`0")
    -or $correlation.contract -ne 'supermega.windows-process-image-correlation.v1'
    -or $correlation.processEventObserved -ne $true
    -or $correlation.imageEventObserved -ne $true
    -or $correlation.processEndObserved -ne $true
    -or $correlation.stableProcessKeyObserved -ne $true) {
    Fail 'observer_probe_trace_correlation_failed'
  }
  $processObserved = $correlation.processEventObserved
  $imageObserved = $correlation.imageEventObserved
  if (-not $processObserved -or -not $imageObserved) { Fail 'observer_probe_trace_coverage_incomplete' }
} finally {
  $cancelFailed = $false
  if ($traceStarted) {
    & $wpr -cancel | Out-Null
    if ($LASTEXITCODE -ne 0) { $cancelFailed = $true }
  }
  if ([System.IO.Directory]::Exists($workRoot)) {
    Remove-Item -LiteralPath $workRoot -Recurse -Force
  }
  $cleanupComplete = -not [System.IO.Directory]::Exists($workRoot)
  if ($cancelFailed) { Fail 'observer_probe_trace_cancel_failed' }
}
if (-not $cleanupComplete) { Fail 'observer_probe_cleanup_failed' }

$evidencePath = Join-Path $output 'postgres17-observer-probe.json'
[ordered]@{
  contract = 'supermega.windows-process-image-observer-probe.v1'
  authoritative = $false
  exactSha = $ExactSha
  captureMethod = 'windows-wpr-etw-process-image-probe-v1'
  runner = 'windows-2025'
  osBuild = [Environment]::OSVersion.Version.ToString()
  profileSha256 = $probePolicy.profileSha256
  tools = $tools
  traceStartedBeforeProbe = $traceStopped
  traceStopped = $traceStopped
  traceParsed = $parsed
  droppedEvents = [int64]$eventsLost
  droppedBuffers = [int64]$buffersLost
  processEventObserved = $processObserved
  imageEventObserved = $imageObserved
  processEndObserved = $correlation.processEndObserved
  stableProcessKeyObserved = $correlation.stableProcessKeyObserved
  probeExitCode = [int]$probeExitCode
  drainComplete = $traceStopped -and $parsed
  temporaryDataRemoved = $cleanupComplete
  postgresDownloaded = $false
  postgresExecuted = $false
  databaseStarted = $false
  secretValuesExposed = $false
} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $evidencePath -Encoding UTF8NoBOM
Assert-SanitizedEvidence $evidencePath

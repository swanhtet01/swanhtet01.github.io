[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExactSha
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# This reads one policy-pinned OS file. It never invokes WPR or changes the
# observer's separate executable-acceptance rules.
$wprPath = 'C:\Windows\System32\wpr.exe'
$maxHashBytes = 134217728

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([Convert]::ToHexString($sha.ComputeHash($stream))).ToLowerInvariant() }
    finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
}

function Get-TextSha256([string]$Text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($Text)
    return ([Convert]::ToHexString($sha.ComputeHash($bytes))).ToLowerInvariant()
  } finally { $sha.Dispose() }
}

function Get-LinkClass($Item) {
  if ($null -eq $Item.PSObject.Properties['LinkType']) { return 'Unknown' }
  switch -CaseSensitive ([string]$Item.LinkType) {
    '' { return 'None' }
    'HardLink' { return 'HardLink' }
    'SymbolicLink' { return 'SymbolicLink' }
    'Junction' { return 'Junction' }
    default { return 'Other' }
  }
}

function New-Record {
  return [ordered]@{
    state = 'inspection_error'
    exists = $false
    file = $false
    reparse = $false
    linked = $false
    linkType = 'Unknown'
    bytes = $null
    stable = $false
    sha256 = $null
    signatureStatus = $null
    signatureType = $null
    issuerIsMicrosoft = $null
    issuerSha256 = $null
    signerCertificateSha256 = $null
  }
}

function Inspect-PinnedWpr {
  $record = New-Record
  try { $item = Get-Item -LiteralPath $wprPath -Force -ErrorAction Stop }
  catch [System.Management.Automation.ItemNotFoundException] {
    $record.state = 'absent'
    $record.linkType = 'None'
    return $record
  }
  catch { return $record }

  $record.exists = $true
  try {
    $record.file = $item -is [System.IO.FileInfo]
    $record.reparse = (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)
    $record.linkType = Get-LinkClass $item
    $record.linked = $record.linkType -ne 'None'
    if (-not $record.file -or $record.reparse -or
        $record.linkType -in @('Unknown', 'Other', 'SymbolicLink', 'Junction')) {
      $record.state = 'nonregular'
      return $record
    }
    $record.bytes = [int64]$item.Length
    if ($record.bytes -eq 0) { $record.state = 'zero_length'; return $record }
    if ($record.bytes -gt $maxHashBytes) { $record.state = 'oversize'; return $record }

    $before = Get-Sha256 $wprPath
    $signature = Get-AuthenticodeSignature -LiteralPath $wprPath
    $afterItem = Get-Item -LiteralPath $wprPath -Force -ErrorAction Stop
    $afterLink = Get-LinkClass $afterItem
    if ($afterItem -isnot [System.IO.FileInfo] -or
        (($afterItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) -or
        $afterLink -cne $record.linkType -or [int64]$afterItem.Length -ne $record.bytes -or
        (Get-Sha256 $wprPath) -cne $before) {
      $record.state = 'changed'
      return $record
    }

    $status = [string]$signature.Status
    if ($status -cnotin @('Valid', 'NotSigned', 'HashMismatch', 'NotTrusted', 'UnknownError')) {
      $status = 'Other'
    }
    $type = [string]$signature.SignatureType
    if ($type -cnotin @('Authenticode', 'Catalog', 'None', 'Unknown')) { $type = 'Other' }
    $cert = $signature.SignerCertificate
    $record.sha256 = $before
    $record.signatureStatus = $status
    $record.signatureType = $type
    if ($null -ne $cert) {
      $issuer = [string]$cert.Issuer
      $record.issuerIsMicrosoft = [Regex]::IsMatch(
        $issuer, '(^|,\s*)O=Microsoft Corporation(,|$)')
      $record.issuerSha256 = Get-TextSha256 $issuer
      $record.signerCertificateSha256 =
        ([Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($cert.RawData))).ToLowerInvariant()
    }
    $record.stable = $true
    $record.state = 'regular'
  } catch {
    # An inspection error is a fixed category. Never serialize exception text.
    $record.state = 'inspection_error'
    $record.stable = $false
    $record.sha256 = $null
    $record.signatureStatus = $null
    $record.signatureType = $null
    $record.issuerIsMicrosoft = $null
    $record.issuerSha256 = $null
    $record.signerCertificateSha256 = $null
  }
  return $record
}

try {
  if ($env:GITHUB_REPOSITORY -cne 'swanhtet01/swanhtet01.github.io' -or
      $env:GITHUB_RUN_ATTEMPT -cne '1' -or $env:RUNNER_OS -cne 'Windows' -or
      $env:GITHUB_RUN_ID -cnotmatch '^[1-9][0-9]{0,18}$' -or
      $env:ImageOS -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' -or
      $env:ImageVersion -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' -or
      [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
    throw 'wpr_inventory_context_invalid'
  }
  $outputDirectory = Join-Path $env:RUNNER_TEMP 'supermega-wpr-inventory'
  if (Test-Path -LiteralPath $outputDirectory) { throw 'wpr_inventory_output_exists' }
  $observation = Inspect-PinnedWpr
  $payload = [ordered]@{
    contract = 'supermega.pg17-wpr-capability-inventory.v1'
    exactSha = $ExactSha
    runId = [int64]$env:GITHUB_RUN_ID
    runnerLabel = 'windows-2025'
    imageOS = [string]$env:ImageOS
    imageVersion = [string]$env:ImageVersion
    authoritative = $false
    observerRan = $false
    canCapture = $false
    canRehearse = $false
    wpr = $observation
  }
  $json = $payload | ConvertTo-Json -Depth 4 -Compress
  if ($json.Length -gt 8192) { throw 'wpr_inventory_size_invalid' }
  [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
  $outputFile = Join-Path $outputDirectory 'wpr-capability.json'
  $stream = [System.IO.File]::Open($outputFile, [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  try {
    $writer = [System.IO.StreamWriter]::new($stream, [System.Text.UTF8Encoding]::new($false))
    try { $writer.Write($json) } finally { $writer.Dispose() }
  } finally { $stream.Dispose() }
} catch {
  throw 'wpr_inventory_failed'
}

$ErrorActionPreference = 'Stop'
$TargetPath = [Environment]::GetEnvironmentVariable('SUPERMEGA_AUTHENTICODE_TARGET', 'Process')
if ([string]::IsNullOrWhiteSpace($TargetPath)) {
  throw 'artifact_path_missing'
}
$itemBefore = Get-Item -LiteralPath $TargetPath -Force
if ($itemBefore.PSIsContainer -or (($itemBefore.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {
  throw 'artifact_not_regular_file'
}
$hashBefore = (Get-FileHash -LiteralPath $itemBefore.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$bytesBefore = [int64]$itemBefore.Length

$signature = Get-AuthenticodeSignature -LiteralPath $itemBefore.FullName
$certificate = $signature.SignerCertificate
$timestampCertificate = $signature.TimeStamperCertificate
$certificateSha256 = $null
$subject = $null
$issuer = $null
$ekuOids = @()
$timestampCertificateSha256 = $null
$timestampSubject = $null

if ($null -ne $certificate) {
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $certificateSha256 = -join ($sha256.ComputeHash($certificate.RawData) | ForEach-Object { $_.ToString('x2') })
  } finally {
    $sha256.Dispose()
  }
  $subject = [string]$certificate.Subject
  $issuer = [string]$certificate.Issuer
  $ekuExtension = $certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } | Select-Object -First 1
  if ($null -ne $ekuExtension) {
    $ekuOids = @($ekuExtension.EnhancedKeyUsages | ForEach-Object { [string]$_.Value } | Sort-Object -Unique)
  }
}

if ($null -ne $timestampCertificate) {
  $timestampSha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $timestampCertificateSha256 = -join ($timestampSha256.ComputeHash($timestampCertificate.RawData) | ForEach-Object { $_.ToString('x2') })
  } finally {
    $timestampSha256.Dispose()
  }
  $timestampSubject = [string]$timestampCertificate.Subject
}

$itemAfter = Get-Item -LiteralPath $itemBefore.FullName -Force
$hashAfter = (Get-FileHash -LiteralPath $itemAfter.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if ($itemAfter.PSIsContainer
  -or (($itemAfter.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)
  -or [int64]$itemAfter.Length -ne $bytesBefore
  -or $hashAfter -ne $hashBefore) {
  throw 'artifact_changed_during_inspection'
}

[ordered]@{
  contract = 'supermega.windows-authenticode-observation.v1'
  artifactFileName = [string]$itemAfter.Name
  artifactBytes = [int64]$itemAfter.Length
  artifactSha256 = $hashAfter
  signatureStatus = [string]$signature.Status
  signatureType = [string]$signature.SignatureType
  signerCertificateSha256 = $certificateSha256
  signerSubject = $subject
  signerIssuer = $issuer
  timestampCertificateSha256 = $timestampCertificateSha256
  timestampSubject = $timestampSubject
  ekuOids = $ekuOids
} | ConvertTo-Json -Compress

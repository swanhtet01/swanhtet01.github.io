param(
  [string]$ShopRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$identityPath = Join-Path $ShopRoot 'lib\shop_build_identity.g.dart'
$identity = Get-Content -LiteralPath $identityPath -Raw
if ($identity -notmatch "shopBuildIdentityProfile = 'synthetic_qa_v1'" -or
    $identity -notmatch "shopBuildIdentityQaProfileId = 'synthetic-qa-v1'" -or
    $identity -notmatch "shopBuildIdentityPlatformIdentity = 'dev.supermega.supermega_shop.qa.windows'") {
  throw 'shop_windows_qa_identity_not_generated'
}

$cmakePath = Join-Path $ShopRoot 'windows\CMakeLists.txt'
$resourcePath = Join-Path $ShopRoot 'windows\runner\Runner.rc'
if (-not (Test-Path -LiteralPath $cmakePath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $resourcePath -PathType Leaf)) {
  throw 'shop_windows_runner_missing'
}

function Replace-ExactOnce(
  [string]$Source,
  [string]$Before,
  [string]$After,
  [string]$Failure
) {
  $matches = ([regex]::Matches($Source, [regex]::Escape($Before))).Count
  if ($matches -ne 1) { throw $Failure }
  return $Source.Replace($Before, $After)
}

$cmake = Get-Content -LiteralPath $cmakePath -Raw
$cmake = Replace-ExactOnce `
  $cmake `
  'set(BINARY_NAME "supermega_shop")' `
  'set(BINARY_NAME "supermega_shop_qa")' `
  'shop_windows_binary_identity_unexpected'

$resource = Get-Content -LiteralPath $resourcePath -Raw
$resource = Replace-ExactOnce $resource 'VALUE "FileDescription", "supermega_shop" "\0"' 'VALUE "FileDescription", "Shop QA" "\0"' 'shop_windows_file_description_unexpected'
$resource = Replace-ExactOnce $resource 'VALUE "InternalName", "supermega_shop" "\0"' 'VALUE "InternalName", "supermega_shop_qa" "\0"' 'shop_windows_internal_name_unexpected'
$resource = Replace-ExactOnce $resource 'VALUE "OriginalFilename", "supermega_shop.exe" "\0"' 'VALUE "OriginalFilename", "supermega_shop_qa.exe" "\0"' 'shop_windows_filename_unexpected'
$resource = Replace-ExactOnce $resource 'VALUE "ProductName", "supermega_shop" "\0"' 'VALUE "ProductName", "Shop QA" "\0"' 'shop_windows_product_name_unexpected'

Set-Content -LiteralPath $cmakePath -Value $cmake -Encoding utf8NoBOM
Set-Content -LiteralPath $resourcePath -Value $resource -Encoding utf8NoBOM
Write-Output 'Configured promotion-ineligible Shop QA Windows identity: supermega_shop_qa.exe / Shop QA'

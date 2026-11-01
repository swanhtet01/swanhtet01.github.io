param(
  [string]$ShopRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$runnerRoot = Join-Path $ShopRoot 'windows\runner'
$cmakePath = Join-Path $runnerRoot 'CMakeLists.txt'
$windowPath = Join-Path $runnerRoot 'flutter_window.cpp'
$overlayRoot = Join-Path $PSScriptRoot 'runner'
foreach ($path in @($runnerRoot, $cmakePath, $windowPath, $overlayRoot)) {
  if (-not (Test-Path -LiteralPath $path)) { throw 'windows_security_overlay_input_missing' }
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

foreach ($name in @(
  'connected_security_bridge.cpp',
  'connected_security_bridge.h',
  'connected_security_store.cpp',
  'connected_security_store.h'
)) {
  $source = Join-Path $overlayRoot $name
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw 'windows_security_overlay_source_missing'
  }
  Copy-Item -LiteralPath $source -Destination (Join-Path $runnerRoot $name)
}

$window = Get-Content -LiteralPath $windowPath -Raw
$window = Replace-ExactOnce `
  $window `
  '#include "flutter_window.h"' `
  "#include `"flutter_window.h`"`n`n#include `"connected_security_bridge.h`"" `
  'windows_security_overlay_include_anchor_invalid'
$window = Replace-ExactOnce `
  $window `
  '  RegisterPlugins(flutter_controller_->engine());' `
  "  RegisterPlugins(flutter_controller_->engine());`n  supermega::connected_security::RegisterConnectedSecurityChannel(`n      flutter_controller_->engine());" `
  'windows_security_overlay_registration_anchor_invalid'

$cmake = Get-Content -LiteralPath $cmakePath -Raw
$cmake = Replace-ExactOnce `
  $cmake `
  '  "flutter_window.cpp"' `
  "  `"flutter_window.cpp`"`n  `"connected_security_bridge.cpp`"`n  `"connected_security_store.cpp`"" `
  'windows_security_overlay_cmake_source_anchor_invalid'
$cmake = Replace-ExactOnce `
  $cmake `
  'target_link_libraries(${BINARY_NAME} PRIVATE "dwmapi.lib")' `
  "target_link_libraries(`${BINARY_NAME} PRIVATE `"dwmapi.lib`")`ntarget_link_libraries(`${BINARY_NAME} PRIVATE `"advapi32.lib`" `"crypt32.lib`" `"ole32.lib`" `"shell32.lib`")" `
  'windows_security_overlay_cmake_library_anchor_invalid'

Set-Content -LiteralPath $windowPath -Value $window -Encoding utf8NoBOM
Set-Content -LiteralPath $cmakePath -Value $cmake -Encoding utf8NoBOM
Write-Output 'Applied fail-closed Windows connected-security overlay.'

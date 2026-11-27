Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($env:RUNNER_OS -cne 'Windows' -or
    $env:GITHUB_REPOSITORY -cne 'swanhtet01/swanhtet01.github.io' -or
    $env:GITHUB_EVENT_NAME -cne 'pull_request' -or
    [string]::IsNullOrWhiteSpace($env:GITHUB_EVENT_PATH) -or
    [string]::IsNullOrWhiteSpace($env:SHOP_UIA_EXPECTED_HEAD)) {
  throw 'uia_capability_job_identity_invalid'
}
$eventPayload = Get-Content -LiteralPath $env:GITHUB_EVENT_PATH -Raw | ConvertFrom-Json
if ($eventPayload.action -cne 'labeled' -or
    $eventPayload.label.name -cne 'shop-windows-uia-capability' -or
    $eventPayload.pull_request.number -ne 752 -or
    $eventPayload.pull_request.state -cne 'open' -or
    $eventPayload.pull_request.draft -ne $true -or
    $eventPayload.pull_request.base.ref -cne 'codex/shop-main-integration-20261022' -or
    $eventPayload.pull_request.head.ref -cne 'codex/postgres17-provenance-integration-20261031' -or
    $eventPayload.pull_request.head.repo.full_name -cne $env:GITHUB_REPOSITORY -or
    $eventPayload.pull_request.head.sha -cne $env:SHOP_UIA_EXPECTED_HEAD -or
    $env:SHOP_UIA_EXPECTED_HEAD -cnotmatch '^[a-f0-9]{40}$') {
  throw 'uia_capability_event_scope_invalid'
}
$checkedOutHead = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $checkedOutHead -cne $env:SHOP_UIA_EXPECTED_HEAD) {
  throw 'uia_capability_source_head_mismatch'
}
if ([string]::IsNullOrWhiteSpace($env:ImageOS) -or
    [string]::IsNullOrWhiteSpace($env:ImageVersion) -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP) -or
    [string]::IsNullOrWhiteSpace($env:GITHUB_OUTPUT)) {
  throw 'uia_capability_host_identity_missing'
}

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SuperMegaUiaNative {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
  [DllImport("user32.dll", SetLastError = true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool CloseDesktop(IntPtr desktop);
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [StructLayout(LayoutKind.Sequential)]
  public struct Point { public int X; public int Y; }
  [DllImport("user32.dll", SetLastError = true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool ClientToScreen(IntPtr window, ref Point point);
}
'@

$driver = [System.Diagnostics.Process]::GetCurrentProcess()
if ($driver.SessionId -le 0) { throw 'uia_capability_noninteractive_session' }
$desktop = [SuperMegaUiaNative]::OpenInputDesktop(0, $false, 1)
if ($desktop -eq [IntPtr]::Zero) { throw 'uia_capability_input_desktop_unavailable' }
if (-not [SuperMegaUiaNative]::CloseDesktop($desktop)) {
  throw 'uia_capability_desktop_close_failed'
}

$runnerTemp = [System.IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')
if (-not [System.IO.Directory]::Exists($runnerTemp)) {
  throw 'uia_capability_runner_temp_missing'
}
$nonce = [Guid]::NewGuid().ToString('N')
$fixtureRoot = Join-Path $runnerTemp ('shop-uia-fixture-' + $nonce)
$evidenceRoot = Join-Path $runnerTemp ('shop-uia-capability-evidence-' + $nonce)
if ((Test-Path -LiteralPath $fixtureRoot) -or
    (Test-Path -LiteralPath $evidenceRoot)) {
  throw 'uia_capability_owned_path_preexists'
}
$fixturePath = Join-Path $PSScriptRoot 'shop_windows_uia_fixture.ps1'
if (-not (Test-Path -LiteralPath $fixturePath -PathType Leaf)) {
  throw 'uia_capability_fixture_missing'
}
[void](New-Item -ItemType Directory -Path $fixtureRoot)
$resultPath = Join-Path $fixtureRoot 'action.txt'
$child = $null
$screenshot = $null
$proof = $null
$ownsEvidence = $false
try {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = Join-Path $PSHOME 'powershell.exe'
  $psi.Arguments = '-NoProfile -STA -File "' + $fixturePath + '" -ResultPath "' +
    $resultPath + '" -Nonce ' + $nonce
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $false
  $psi.EnvironmentVariables.Clear()
  $psi.EnvironmentVariables['SystemRoot'] = $env:SystemRoot
  $psi.EnvironmentVariables['windir'] = $env:SystemRoot
  $psi.EnvironmentVariables['PATH'] = (Join-Path $env:SystemRoot 'System32') + ';' + $PSHOME
  $psi.EnvironmentVariables['TEMP'] = $fixtureRoot
  $psi.EnvironmentVariables['TMP'] = $fixtureRoot
  $child = [System.Diagnostics.Process]::Start($psi)
  if ($null -eq $child) { throw 'uia_capability_fixture_launch_failed' }

  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  do {
    if ($child.HasExited) { throw 'uia_capability_fixture_exited_early' }
    $child.Refresh()
    if ($child.MainWindowHandle -ne [IntPtr]::Zero) { break }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $deadline)
  $handle = $child.MainWindowHandle
  if ($handle -eq [IntPtr]::Zero -or $child.SessionId -ne $driver.SessionId) {
    throw 'uia_capability_fixture_window_or_session_missing'
  }

  $window = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
  if ($null -eq $window -or $window.Current.IsOffscreen) {
    throw 'uia_capability_window_not_visible'
  }
  $condition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::NameProperty,
    'Invoke fixture'
  )
  $button = $window.FindFirst(
    [System.Windows.Automation.TreeScope]::Descendants, $condition
  )
  if ($null -eq $button -or -not $button.Current.IsEnabled -or
      $button.Current.IsOffscreen) {
    throw 'uia_capability_button_unavailable'
  }
  $window.SetFocus()
  Start-Sleep -Milliseconds 200
  if ([SuperMegaUiaNative]::GetForegroundWindow() -ne $handle) {
    throw 'uia_capability_foreground_missing'
  }
  if (Test-Path -LiteralPath $resultPath) {
    throw 'uia_capability_action_result_preexists'
  }
  $pattern = [System.Windows.Automation.InvokePattern]$button.GetCurrentPattern(
    [System.Windows.Automation.InvokePattern]::Pattern
  )
  $pattern.Invoke()
  $deadline = [DateTime]::UtcNow.AddSeconds(5)
  while (-not (Test-Path -LiteralPath $resultPath) -and
         [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 100
  }
  if (-not (Test-Path -LiteralPath $resultPath) -or
      [System.IO.File]::ReadAllText($resultPath) -cne $nonce) {
    throw 'uia_capability_action_not_observed'
  }
  $invokedCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::NameProperty, 'Invoked'
  )
  if ($null -eq $window.FindFirst(
      [System.Windows.Automation.TreeScope]::Descendants, $invokedCondition
  )) {
    throw 'uia_capability_accessible_state_not_updated'
  }

  $bounds = $window.Current.BoundingRectangle
  if ($bounds.Width -lt 300 -or $bounds.Width -gt 1200 -or
      $bounds.Height -lt 220 -or $bounds.Height -gt 900) {
    throw 'uia_capability_window_bounds_invalid'
  }
  $clientOrigin = New-Object 'SuperMegaUiaNative+Point'
  $clientOrigin.X = 20
  $clientOrigin.Y = 100
  if (-not [SuperMegaUiaNative]::ClientToScreen($handle, [ref]$clientOrigin)) {
    throw 'uia_capability_client_screen_position_missing'
  }
  # Crop only the two fixed color panels and the white gap between them.
  $width = 180
  $height = 80
  $screenshot = [System.Drawing.Bitmap]::new($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($screenshot)
  try {
    $graphics.CopyFromScreen($clientOrigin.X, $clientOrigin.Y, 0, 0, $screenshot.Size)
  } finally {
    $graphics.Dispose()
  }
  for ($x = 0; $x -lt $width; $x++) {
    for ($y = 0; $y -lt $height; $y++) {
      $color = $screenshot.GetPixel($x, $y).ToArgb()
      $expectedColor = if ($x -lt 80) {
        [System.Drawing.Color]::Red.ToArgb()
      } elseif ($x -lt 100) {
        [System.Drawing.Color]::White.ToArgb()
      } else {
        [System.Drawing.Color]::Blue.ToArgb()
      }
      if ($color -ne $expectedColor) {
        throw 'uia_capability_fixture_pixels_missing'
      }
    }
  }
  [void](New-Item -ItemType Directory -Path $evidenceRoot)
  $ownsEvidence = $true
  [System.IO.File]::WriteAllText(
    (Join-Path $evidenceRoot 'owner.txt'), $nonce, [System.Text.Encoding]::ASCII
  )
  $pngPath = Join-Path $evidenceRoot 'fixture-window.png'
  $screenshot.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $pngPath).Hash.ToLowerInvariant()
  $proof = [ordered]@{
    contract = 'supermega.shop.windows-uia-capability.v1'
    sourceHead = $env:SHOP_UIA_EXPECTED_HEAD
    runnerLabel = 'windows-latest'
    imageOS = $env:ImageOS
    imageVersion = $env:ImageVersion
    osVersion = [Environment]::OSVersion.Version.ToString()
    driverSessionId = $driver.SessionId
    fixtureSessionMatches = $true
    inputDesktopOpen = $true
    foregroundFixture = $true
    uiaInvokeAndReadback = $true
    screenshotContainsFixture = $true
    screenshotWidth = $width
    screenshotHeight = $height
    screenshotSha256 = $pngHash
    driverSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $PSCommandPath).Hash.ToLowerInvariant()
    fixtureSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $fixturePath).Hash.ToLowerInvariant()
    shopStarted = $false
    installedAcceptance = $false
    scopedFixtureCleanup = $false
  }
} finally {
  $cleanupFailed = $true
  try {
    if ($null -ne $screenshot) { $screenshot.Dispose() }
    if ($null -ne $child) {
      if (-not $child.HasExited) {
        [void]$child.CloseMainWindow()
        if (-not $child.WaitForExit(2000)) {
          $child.Kill()
          if (-not $child.WaitForExit(2000)) {
            throw 'uia_capability_fixture_process_still_running'
          }
        }
      }
      if (-not $child.HasExited) { throw 'uia_capability_fixture_process_still_running' }
      $child.Dispose()
    }
    if ($fixtureRoot.StartsWith($runnerTemp + '\',
        [System.StringComparison]::OrdinalIgnoreCase) -and
        (Test-Path -LiteralPath $fixtureRoot)) {
      $fixtureEntry = Get-Item -LiteralPath $fixtureRoot -Force
      if (($fixtureEntry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'uia_capability_fixture_root_reparse_point'
      }
      Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    }
    if (Test-Path -LiteralPath $fixtureRoot) {
      throw 'uia_capability_fixture_cleanup_failed'
    }
    $cleanupFailed = $false
  } finally {
    # If fixture cleanup failed before publishing the workflow outputs, remove
    # the owned proof here too. Never report a successful cleanup in that case.
    if (($null -eq $proof -or $cleanupFailed) -and $ownsEvidence -and
        $evidenceRoot.StartsWith($runnerTemp + '\',
          [System.StringComparison]::OrdinalIgnoreCase) -and
        (Test-Path -LiteralPath $evidenceRoot)) {
      $evidenceEntry = Get-Item -LiteralPath $evidenceRoot -Force
      if (($evidenceEntry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'uia_capability_evidence_root_reparse_point'
      }
      Remove-Item -LiteralPath $evidenceRoot -Recurse -Force
    }
  }
}

if ($null -eq $proof) { throw 'uia_capability_proof_missing' }
$proof.scopedFixtureCleanup = $true
$json = $proof | ConvertTo-Json -Compress
$jsonPath = Join-Path $evidenceRoot 'result.json'
try {
  [System.IO.File]::WriteAllText($jsonPath, $json, [System.Text.Encoding]::UTF8)
  Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value ('evidence_dir=' + $evidenceRoot)
  Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value ('owner_nonce=' + $nonce)
} catch {
  if ($ownsEvidence -and (Test-Path -LiteralPath $evidenceRoot)) {
    $evidenceEntry = Get-Item -LiteralPath $evidenceRoot -Force
    if (($evidenceEntry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'uia_capability_evidence_root_reparse_point'
    }
    Remove-Item -LiteralPath $evidenceRoot -Recurse -Force
  }
  throw
}
Write-Output $json

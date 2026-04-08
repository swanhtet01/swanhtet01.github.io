param(
  [string]$RepoRoot = "C:\Users\swann\AppData\Local\Temp\supermega-promote-20260404-1",
  [int]$Port = 4173
)

$ErrorActionPreference = 'Stop'

$showroomDir = Join-Path $RepoRoot 'showroom'
$outputDir = Join-Path $showroomDir 'public\site'
$previewLog = Join-Path $RepoRoot ("tmp-site-preview-{0}.log" -f ([DateTime]::Now.ToString('yyyyMMdd-HHmmss')))
$baseUrl = "http://127.0.0.1:$Port"

$edgePath = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $edgePath) {
  throw 'Microsoft Edge was not found.'
}

if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

$captures = @(
  @{ Route = '/products/sales-system'; File = 'sales-system-screen.png' },
  @{ Route = '/products/operations-inbox'; File = 'ops-inbox-screen.png' },
  @{ Route = '/products/founder-brief'; File = 'founder-brief-screen.png' },
  @{ Route = '/products/client-portal'; File = 'client-portal-screen.png' }
)

Push-Location $showroomDir
$previewProcess = $null

try {
  npm run build

  $previewCommand = "npm run preview -- --host 127.0.0.1 --port $Port *> `"$previewLog`""
  $previewProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoLogo', '-NoProfile', '-Command', $previewCommand -WorkingDirectory $showroomDir -PassThru

  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
      Invoke-WebRequest -UseBasicParsing "$baseUrl/" | Out-Null
      $ready = $true
      break
    } catch {
    }
  }

  if (-not $ready) {
    throw "Preview server did not become ready at $baseUrl."
  }

  foreach ($capture in $captures) {
    $targetPath = Join-Path $outputDir $capture.File
    $arguments = @(
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--window-size=1600,1600',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=8000',
      "--screenshot=$targetPath",
      "$baseUrl$($capture.Route)"
    )

    & $edgePath @arguments
    Start-Sleep -Milliseconds 500

    if ($LASTEXITCODE -ne 0 -and -not (Test-Path $targetPath)) {
      throw "Capture failed for $($capture.Route)."
    }
  }
} finally {
  if ($previewProcess -and -not $previewProcess.HasExited) {
    Stop-Process -Id $previewProcess.Id -Force
  }
  Pop-Location
}

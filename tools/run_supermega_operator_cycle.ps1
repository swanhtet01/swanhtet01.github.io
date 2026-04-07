param(
  [string]$BaseUrl = "https://supermega-app-453184845544.asia-southeast1.run.app",
  [string]$PublicUrl = "https://supermega.dev",
  [string]$RunId = "",
  [string]$PythonPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-PythonPath {
  param([string]$RequestedPath)

  if ($RequestedPath -and (Test-Path -LiteralPath $RequestedPath)) {
    return $RequestedPath
  }

  $candidate = Join-Path $env:USERPROFILE "OneDrive - BDA\.venv\Scripts\python.exe"
  if (Test-Path -LiteralPath $candidate) {
    return $candidate
  }

  return "python"
}

function Get-RouteStatus {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -Uri $Url -Method Head -UseBasicParsing -TimeoutSec 20
    return [int]$response.StatusCode
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      return [int]$_.Exception.Response.StatusCode.value__
    }
    return 0
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$smokeScript = Join-Path $PSScriptRoot "smoke_test_supermega_app.py"
$python = Resolve-PythonPath -RequestedPath $PythonPath

$smokeJson = & $python $smokeScript --base-url $BaseUrl --as-json
$smoke = $smokeJson | Out-String | ConvertFrom-Json

$publicRoutes = [ordered]@{
  home = Get-RouteStatus -Url "$PublicUrl/"
  products = Get-RouteStatus -Url "$PublicUrl/products/"
  work = Get-RouteStatus -Url "$PublicUrl/work/"
  contact = Get-RouteStatus -Url "$PublicUrl/contact/"
  app = Get-RouteStatus -Url "$BaseUrl/"
}

$deploy = $null
if ($RunId) {
  try {
    $deploy = Invoke-RestMethod -Uri "https://api.github.com/repos/swanhtet01/swanhtet01.github.io/actions/runs/$RunId" -Headers @{ "User-Agent" = "Codex" }
  } catch {
    $deploy = $null
  }
}

$report = [ordered]@{
  checked_at = (Get-Date).ToString("s")
  base_url = $BaseUrl
  public_url = $PublicUrl
  public_routes = $publicRoutes
  live_app = $smoke
  deploy = if ($deploy) {
    [ordered]@{
      id = $deploy.id
      status = $deploy.status
      conclusion = $deploy.conclusion
      html_url = $deploy.html_url
      updated_at = $deploy.updated_at
    }
  } else {
    $null
  }
}

$report | ConvertTo-Json -Depth 8

param(
  [string]$RepoRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = Split-Path -Parent $PSScriptRoot
}

$renderScript = Join-Path $PSScriptRoot "render_supermega_ops_hub.ps1"
$result = & powershell -ExecutionPolicy Bypass -File $renderScript -RepoRoot $RepoRoot | Out-String | ConvertFrom-Json

if ($result.status -ne "ready") {
  throw "Ops hub could not be rendered."
}

Start-Process $result.output

[ordered]@{
  status = "ready"
  output = $result.output
  opened_at = (Get-Date).ToString("s")
} | ConvertTo-Json -Depth 3

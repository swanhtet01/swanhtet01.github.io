param(
    [string]$BaseUrl = "http://127.0.0.1:8787",
    [string]$Username = "owner",
    [string]$Password = $env:SUPERMEGA_APP_PASSWORD,
    [string]$WorkspaceSlug = "supermega-lab"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Password)) {
    throw "Set SUPERMEGA_APP_PASSWORD before starting the private SuperMega MCP server."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$mcpRoot = Join-Path $repoRoot "mark1-mcp"
$serverPath = Join-Path $mcpRoot "server.mjs"
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    throw "Node.js is required to run the SuperMega MCP server."
}

$env:SUPERMEGA_BASE_URL = $BaseUrl
$env:SUPERMEGA_APP_USERNAME = $Username
$env:SUPERMEGA_APP_PASSWORD = $Password
$env:SUPERMEGA_WORKSPACE_SLUG = $WorkspaceSlug
$env:SUPERMEGA_REPO_ROOT = $repoRoot

& $nodeCmd.Source $serverPath
exit $LASTEXITCODE

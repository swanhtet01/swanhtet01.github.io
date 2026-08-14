[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $RunnerArguments
)

$ErrorActionPreference = 'Stop'
$runnerPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'run_preview_branch_rehearsal.mjs'))
$nodePath = [string]$env:SUPERMEGA_NODE_BIN
if (-not [System.IO.Path]::IsPathRooted($nodePath)) {
    throw 'supermega_node_bin_absolute_path_required'
}
$nodePath = [System.IO.Path]::GetFullPath($nodePath)
if ([System.IO.Path]::GetFileName($nodePath).ToLowerInvariant() -notin @('node.exe', 'node')) {
    throw 'supermega_node_bin_invalid'
}
if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    throw 'supermega_node_bin_missing'
}

$captureOnly = $RunnerArguments.Count -eq 1 -and $RunnerArguments[0] -in @(
    '--capture-trust-inputs', '--capture-branch-receipt'
)
$localOnly = $RunnerArguments.Count -eq 1 -and $RunnerArguments[0] -in @('--self-test', '--dry-run')
if (-not $captureOnly -and -not $localOnly) {
    $approvalPath = [string]$env:SUPERMEGA_REHEARSAL_APPROVAL_FILE
    if (-not [System.IO.Path]::IsPathRooted($approvalPath)) {
        throw 'rehearsal_approval_file_absolute_path_required'
    }
    $approval = Get-Content -LiteralPath $approvalPath -Raw | ConvertFrom-Json
    $approvedNodePath = [System.IO.Path]::GetFullPath([string]$approval.trust.executables.node.path)
    $approvedNodeDigest = [string]$approval.trust.executables.node.digest
    $approvedRunnerDigest = [string]$approval.trust.sources.runner
    $approvedLauncherDigest = [string]$approval.trust.sources.launcher
    $actualNodeDigest = 'sha256:' + (Get-FileHash -LiteralPath $nodePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $actualRunnerDigest = 'sha256:' + (Get-FileHash -LiteralPath $runnerPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $actualLauncherDigest = 'sha256:' + (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($approvedNodePath -ne $nodePath -or $approvedNodeDigest -ne $actualNodeDigest) {
        throw 'rehearsal_approved_node_runtime_changed'
    }
    if ($approvedRunnerDigest -ne $actualRunnerDigest -or $approvedLauncherDigest -ne $actualLauncherDigest) {
        throw 'rehearsal_approved_launcher_source_changed'
    }
}

foreach ($name in @(
    'NODE_OPTIONS', 'NODE_PATH', 'NPM_CONFIG_NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS',
    'OPENSSL_CONF', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTP_PROXY', 'HTTPS_PROXY',
    'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'
)) {
    Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
}
$env:SUPERMEGA_REHEARSAL_SCRUBBED_LAUNCHER = 'v1'

& $nodePath $runnerPath @RunnerArguments
exit $LASTEXITCODE

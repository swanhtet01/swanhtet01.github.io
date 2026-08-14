[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $RunnerArguments
)

$ErrorActionPreference = 'Stop'
$trustedHostedBootstrapDigest = $null
$localOnly = $RunnerArguments.Count -eq 1 -and $RunnerArguments[0] -in @(
    '--self-test', '--dry-run', '--capture-trust-inputs'
)
if (-not $localOnly) {
    # Hosted use stays closed until a separate reviewed implementation supplies
    # an independently verifiable launcher-to-runner contract. A digest or
    # caller-provided environment attestation alone must never unlock it.
    if ($null -eq $trustedHostedBootstrapDigest) {
        throw 'rehearsal_hosted_bootstrap_unconfigured'
    }
    throw 'rehearsal_hosted_bootstrap_unconfigured'
}

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

foreach ($name in @(
    'NODE_OPTIONS', 'NODE_PATH', 'NPM_CONFIG_NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS',
    'OPENSSL_CONF', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTP_PROXY', 'HTTPS_PROXY',
    'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'
)) {
    Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
}

& $nodePath $runnerPath @RunnerArguments
exit $LASTEXITCODE

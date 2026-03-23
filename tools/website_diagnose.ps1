param(
    [string]$Domain = "supermega.dev",
    [int]$TimeoutSec = 25,
    [string]$OutputJson = ""
)

$ErrorActionPreference = "Stop"

function Resolve-Record {
    param(
        [string]$Name,
        [string]$Server = ""
    )
    try {
        if ([string]::IsNullOrWhiteSpace($Server)) {
            $records = Resolve-DnsName -Name $Name -Type A
        }
        else {
            $records = Resolve-DnsName -Name $Name -Type A -Server $Server
        }
        $ips = @($records | Where-Object { $_.IPAddress } | Select-Object -ExpandProperty IPAddress)
        return @{
            status = if ($ips.Count -gt 0) { "ready" } else { "empty" }
            ips = $ips
            error = ""
        }
    }
    catch {
        return @{
            status = "error"
            ips = @()
            error = $_.Exception.Message
        }
    }
}

function Probe-Http {
    param([string]$Url)
    try {
        $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
        return @{
            status = "ready"
            http_status = [int]$resp.StatusCode
            error = ""
        }
    }
    catch {
        $statusCode = 0
        try {
            if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
                $statusCode = [int]$_.Exception.Response.StatusCode.value__
            }
        }
        catch {
            $statusCode = 0
        }
        return @{
            status = if ($statusCode -gt 0) { "http_error" } else { "network_error" }
            http_status = $statusCode
            error = $_.Exception.Message
        }
    }
}

$www = "www.$Domain"
$localApex = Resolve-Record -Name $Domain
$localWww = Resolve-Record -Name $www
$googleApex = Resolve-Record -Name $Domain -Server "8.8.8.8"
$cloudflareApex = Resolve-Record -Name $Domain -Server "1.1.1.1"
$httpApex = Probe-Http -Url ("https://{0}" -f $Domain)
$httpWww = Probe-Http -Url ("https://{0}" -f $www)

$diagnosis = "ok"
$recommendations = @()

if ($localApex.status -ne "ready" -and ($googleApex.status -eq "ready" -or $cloudflareApex.status -eq "ready")) {
    $diagnosis = "local_dns_failure"
    $recommendations += "Run: ipconfig /flushdns"
    $recommendations += "Set DNS resolvers to 1.1.1.1 and 8.8.8.8 on your active network adapter."
    $recommendations += "In browser Secure DNS settings, use Cloudflare or Google instead of current provider."
    $recommendations += ("Use https://{0} as immediate fallback while local DNS cache refreshes." -f $www)
}
elseif ($googleApex.status -ne "ready" -and $cloudflareApex.status -ne "ready") {
    $diagnosis = "authoritative_dns_issue"
    $recommendations += "Check authoritative A records for apex and CNAME for www in Google Domains DNS."
}
elseif ($httpApex.status -ne "ready" -and $httpWww.status -eq "ready") {
    $diagnosis = "apex_http_issue"
    $recommendations += "Keep www as temporary canonical path and re-check apex DNS and HTTPS propagation."
}
elseif ($httpApex.status -ne "ready" -and $httpWww.status -ne "ready") {
    $diagnosis = "http_connectivity_issue"
    $recommendations += "Check local firewall/proxy/VPN and retry from another network."
}
else {
    $recommendations += "Domain and HTTPS look healthy from this machine."
}

$payload = @{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    domain = $Domain
    checks = @{
        local_resolve_apex = $localApex
        local_resolve_www = $localWww
        google_resolve_apex = $googleApex
        cloudflare_resolve_apex = $cloudflareApex
        https_apex = $httpApex
        https_www = $httpWww
    }
    diagnosis = $diagnosis
    recommendations = $recommendations
}

if (-not [string]::IsNullOrWhiteSpace($OutputJson)) {
    $outPath = $OutputJson
    if (-not [System.IO.Path]::IsPathRooted($outPath)) {
        $outPath = Join-Path (Get-Location) $outPath
    }
    $outDir = Split-Path -Parent $outPath
    if (-not (Test-Path -LiteralPath $outDir)) {
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    }
    $payload | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $outPath -Encoding UTF8
    $payload["output_json"] = $outPath
}

$payload | ConvertTo-Json -Depth 10

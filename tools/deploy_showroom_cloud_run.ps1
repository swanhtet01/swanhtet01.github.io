param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectId,
    [string]$Region = "asia-southeast1",
    [string]$Service = "supermega-showroom",
    [string]$Domain = "supermega.dev",
    [switch]$SkipLocalBuild
)

$ErrorActionPreference = "Stop"

function Require-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

Require-Command -Name "gcloud"
Require-Command -Name "npm"

$repoRoot = Split-Path -Parent $PSScriptRoot
$showroomDir = Join-Path $repoRoot "showroom"
$image = "gcr.io/$ProjectId/$Service:latest"

if (-not (Test-Path $showroomDir)) {
    throw "Showroom folder not found: $showroomDir"
}

if (-not $SkipLocalBuild) {
    Push-Location $showroomDir
    try {
        npm ci
        npm run build
    }
    finally {
        Pop-Location
    }
}

Write-Host "Setting active gcloud project to $ProjectId"
gcloud config set project $ProjectId | Out-Null

Write-Host "Building container image: $image"
gcloud builds submit $showroomDir --tag $image

Write-Host "Deploying Cloud Run service: $Service ($Region)"
gcloud run deploy $Service `
    --image $image `
    --region $Region `
    --platform managed `
    --allow-unauthenticated `
    --port 8080

$serviceUrl = gcloud run services describe $Service --region $Region --format "value(status.url)"

Write-Host ""
Write-Host "Cloud Run deploy complete."
Write-Host "Service URL: $serviceUrl"
Write-Host ""
Write-Host "Next steps for custom domain ($Domain):"
Write-Host "1) Map domain:"
Write-Host "   gcloud run domain-mappings create --service $Service --domain $Domain --region $Region"
Write-Host "2) Then add DNS records exactly as returned by Cloud Run domain mapping describe output."
Write-Host "3) Validate HTTPS after certificate provisioning finishes."

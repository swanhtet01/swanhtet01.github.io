param(
    [string]$ProjectId = "supermega-468612",
    [string]$Region = "asia-southeast1",
    [string]$Service = "supermega-showroom",
    [string]$ServiceAccountEmail = ""
)

$ErrorActionPreference = "Stop"

function Has-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Run-Gcloud {
    param([string[]]$Args)
    try {
        $output = & gcloud @Args 2>&1
        return @{
            status = "ready"
            output = @($output)
        }
    }
    catch {
        return @{
            status = "error"
            output = @($_.Exception.Message)
        }
    }
}

if (-not (Has-Command -Name "gcloud")) {
    @{
        status = "missing_gcloud"
        message = "gcloud CLI is not installed or not on PATH."
        recommendations = @(
            "Install Google Cloud SDK.",
            "Run: gcloud auth login",
            "Run this preflight again."
        )
    } | ConvertTo-Json -Depth 10
    exit 1
}

$activeAccountResult = Run-Gcloud -Args @("auth", "list", "--filter=status:ACTIVE", "--format=value(account)")
$activeAccount = ""
if ($activeAccountResult.status -eq "ready") {
    $activeAccount = ($activeAccountResult.output | Select-Object -First 1).ToString().Trim()
}

$projectSet = Run-Gcloud -Args @("config", "set", "project", $ProjectId)

$enabledApisResult = Run-Gcloud -Args @("services", "list", "--enabled", "--project", $ProjectId, "--format=value(config.name)")
$enabledApis = @()
if ($enabledApisResult.status -eq "ready") {
    $enabledApis = @($enabledApisResult.output | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ })
}

$requiredApis = @(
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com"
)
$missingApis = @($requiredApis | Where-Object { $_ -notin $enabledApis })

$effectiveServiceAccount = $ServiceAccountEmail
if ([string]::IsNullOrWhiteSpace($effectiveServiceAccount)) {
    $envSa = [string]$env:GOOGLE_SERVICE_ACCOUNT_EMAIL
    if (-not [string]::IsNullOrWhiteSpace($envSa)) {
        $effectiveServiceAccount = $envSa.Trim()
    }
}

$recommendations = @()
if ([string]::IsNullOrWhiteSpace($activeAccount)) {
    $recommendations += "No active gcloud account. Run: gcloud auth login"
}
if ($projectSet.status -ne "ready") {
    $recommendations += "Could not set active project. Verify project access."
}
if ($missingApis.Count -gt 0) {
    $recommendations += ("Enable APIs: gcloud services enable {0} --project {1}" -f ($missingApis -join " "), $ProjectId)
}
if (-not [string]::IsNullOrWhiteSpace($effectiveServiceAccount)) {
    $recommendations += ("Grant Service Usage Admin so CI can enable APIs: gcloud projects add-iam-policy-binding {0} --member=serviceAccount:{1} --role=roles/serviceusage.serviceUsageAdmin" -f $ProjectId, $effectiveServiceAccount)
    $recommendations += ("Grant Cloud Run Admin: gcloud projects add-iam-policy-binding {0} --member=serviceAccount:{1} --role=roles/run.admin" -f $ProjectId, $effectiveServiceAccount)
    $recommendations += ("Grant Cloud Build Editor: gcloud projects add-iam-policy-binding {0} --member=serviceAccount:{1} --role=roles/cloudbuild.builds.editor" -f $ProjectId, $effectiveServiceAccount)
    $recommendations += ("Grant Artifact Registry Writer: gcloud projects add-iam-policy-binding {0} --member=serviceAccount:{1} --role=roles/artifactregistry.writer" -f $ProjectId, $effectiveServiceAccount)
}
else {
    $recommendations += "Set GOOGLE_SERVICE_ACCOUNT_EMAIL to get exact IAM grant commands for your CI service account."
}

$status = if ($missingApis.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace($activeAccount) -and $projectSet.status -eq "ready") { "ready" } else { "action_needed" }

$payload = @{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    status = $status
    project_id = $ProjectId
    region = $Region
    service = $Service
    active_account = $activeAccount
    service_account_email = $effectiveServiceAccount
    required_apis = $requiredApis
    missing_apis = $missingApis
    recommendations = $recommendations
}

$payload | ConvertTo-Json -Depth 10
if ($status -eq "ready") {
    exit 0
}
exit 1

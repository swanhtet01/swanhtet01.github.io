param(
  [switch]$SkipBuildOutput,
  [switch]$SkipBrowser,
  [switch]$SkipLeadPost,
  [switch]$HttpOnlyAliases
)

$ErrorActionPreference = 'Stop'

function Invoke-Step {
  param(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments
  )

  Write-Output "==> $Name"
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Step failed: $Name"
  }
}

Invoke-Step 'public vercel config guard' node @('tools\verify_public_vercel_config.mjs')

if (-not $SkipBuildOutput) {
  Invoke-Step 'create public build output' node @('tools\create_public_vercel_output.mjs')
  Invoke-Step 'verify source-to-screen contract' node @('tools\verify_public_source_to_screen_contract.mjs')
  Invoke-Step 'verify free workcell order contract' node @('tools\verify_public_free_workcell_order_contract.mjs')
  Invoke-Step 'verify operator retainer controls' node @('tools\verify_operator_structured_retainer_controls_contract.mjs')
  Invoke-Step 'verify public artifact budget' node @('tools\verify_public_vercel_artifact_budget.mjs')
  Invoke-Step 'verify public build output' node @('tools\verify_public_vercel_output.mjs')
}

$aliasArgs = @('-ExecutionPolicy', 'Bypass', '-File', 'tools\check_public_aliases.ps1')
if ($HttpOnlyAliases) {
  $aliasArgs += '-HttpOnly'
}
Invoke-Step 'public alias contract' powershell $aliasArgs
Invoke-Step 'public route smoke' node @('tools\smoke_public_site.mjs')
Invoke-Step 'lead ledger audit' node @('tools\audit_lead_ledger.mjs')
Invoke-Step 'behavior events audit' node @('tools\audit_behavior_events.mjs')

if (-not $SkipLeadPost) {
  Invoke-Step 'live lead post smoke' node @('tools\smoke_public_lead_post.mjs')
}

if (-not $SkipBrowser) {
  Invoke-Step 'browser usability audit' node @('tools\audit_public_usability.mjs')
}

[ordered]@{
  status = 'ready'
  checked_at = (Get-Date).ToUniversalTime().ToString('o')
  public_domain = 'https://supermega.dev'
  note = 'Customer-facing site, alias, intake API, lead ledger, behavior monitoring, and usability checks passed.'
} | ConvertTo-Json -Depth 4

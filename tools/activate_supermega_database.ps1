param(
  [string]$DatabaseUrl = '',
  [string]$DatabaseUrlFile = '',
  [switch]$Replace,
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$Scope = 'swanhtet01s-projects'

function Resolve-DatabaseUrl {
  if ($DatabaseUrl.Trim()) { return $DatabaseUrl.Trim() }
  if ($DatabaseUrlFile.Trim()) {
    if (-not (Test-Path -LiteralPath $DatabaseUrlFile)) { throw 'DatabaseUrlFile was not found.' }
    $value = (Get-Content -Raw -LiteralPath $DatabaseUrlFile).Trim()
    if ($value) { return $value }
  }
  if ($env:SUPERMEGA_DATABASE_URL_TO_ACTIVATE) { return ([string]$env:SUPERMEGA_DATABASE_URL_TO_ACTIVATE).Trim() }
  throw 'Provide -DatabaseUrl, -DatabaseUrlFile, or SUPERMEGA_DATABASE_URL_TO_ACTIVATE.'
}

$resolved = Resolve-DatabaseUrl
if ($resolved -notmatch '^(postgres|postgresql)://') { throw 'DatabaseUrl must start with postgres:// or postgresql://.' }

$previous = $env:SUPERMEGA_DATABASE_URL
try {
  # Keep the URL out of command arguments and logs; the validator reads this process-scoped value.
  $env:SUPERMEGA_DATABASE_URL = $resolved
  Write-Output '==> validate managed Postgres and SuperMega schema'
  & uv run python tools/validate_supermega_database_url.py --env-key SUPERMEGA_DATABASE_URL --ensure-schema --require-ready
  if ($LASTEXITCODE -ne 0) { throw 'Database validation failed; Vercel was not changed.' }
  if ($ValidateOnly) { Write-Output '{"status":"ready","validate_only":true,"vercel_env_changed":false}'; exit 0 }

  if ($Replace) {
    Write-Output '==> remove existing SUPERMEGA_DATABASE_URL from Vercel production'
    & npx --yes vercel env rm SUPERMEGA_DATABASE_URL production --yes --scope $Scope
    if ($LASTEXITCODE -ne 0) { throw 'Could not remove the existing Vercel production variable.' }
  }

  Write-Output '==> set SUPERMEGA_DATABASE_URL for Vercel production'
  $resolved | & npx --yes vercel env add SUPERMEGA_DATABASE_URL production --scope $Scope
  if ($LASTEXITCODE -ne 0) { throw 'Could not set the Vercel production variable.' }
  Write-Output '{"status":"ready","validate_only":false,"vercel_env_changed":true,"next_step":"Redeploy megaos and run the strict app smoke gate."}'
}
finally {
  if ($null -eq $previous) { Remove-Item Env:SUPERMEGA_DATABASE_URL -ErrorAction SilentlyContinue }
  else { $env:SUPERMEGA_DATABASE_URL = $previous }
}

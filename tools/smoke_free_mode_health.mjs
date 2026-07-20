const baseUrl = (process.env.SUPERMEGA_APP_BASE_URL || 'https://app.supermega.dev').replace(/\/$/, '')
const response = await fetch(`${baseUrl}/api/health`, { headers: { accept: 'application/json' } })
const payload = await response.json().catch(() => ({}))

function fail(reason, extra = {}) {
  console.error(JSON.stringify({ status: 'failed', reason, base_url: baseUrl, ...extra }, null, 2))
  process.exit(1)
}

if (!response.ok) fail('health_not_ok', { status_code: response.status })
if (payload.free_mode_ready !== true || payload.free_mode?.status !== 'ready') {
  fail('free_mode_not_ready', { free_mode_ready: payload.free_mode_ready, free_mode: payload.free_mode })
}
if (payload.free_mode?.persistence !== 'sqlite_fallback') {
  fail('free_mode_persistence_contract_changed', { persistence: payload.free_mode?.persistence })
}
if (payload.enterprise_activation?.secret_values_exposed !== false) {
  fail('health_secret_exposure_contract_failed')
}

console.log(JSON.stringify({
  status: 'ready',
  contract: 'supermega_free_mode_health',
  free_mode_ready: true,
  enterprise_gate: payload.enterprise_db_ready === true && payload.enterprise_db_scheme !== 'sqlite' ? 'ready' : 'attention',
}, null, 2))

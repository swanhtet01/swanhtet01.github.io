const args = process.argv.slice(2)
const baseUrlFlag = args.indexOf('--base-url')
const baseUrl = baseUrlFlag >= 0 && args[baseUrlFlag + 1]
  ? args[baseUrlFlag + 1]
  : 'https://supermega.dev'

function fail(reason) {
  console.error(JSON.stringify({
    ok: false,
    contract: 'supermega_public_contact_handoff_health',
    reason,
    durable_write: 'not_asserted',
    writes_performed: false,
  }))
  process.exit(1)
}

function assert(condition, reason) {
  if (!condition) fail(reason)
}

async function request(pathname) {
  const response = await fetch(new URL(pathname, baseUrl), {
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  })
  const body = await response.json().catch(() => null)
  return { response, body }
}

try {
  const normalizedBaseUrl = new URL(baseUrl)
  assert(['http:', 'https:'].includes(normalizedBaseUrl.protocol), 'base_url_protocol_invalid')

  const [status, diagnostics] = await Promise.all([
    request('/api/contact-submissions/status'),
    request('/api/contact-submissions/status?detail=1'),
  ])

  assert(status.response.status === 200, `contact_status_http_${status.response.status}`)
  assert(Object.keys(status.body || {}).sort().join(',') === 'service,status', 'contact_status_exposes_internal_fields')
  assert(status.body?.status === 'ready', 'contact_status_not_ready')
  assert(status.body?.service === 'supermega-contact', 'contact_status_wrong_service')

  assert(diagnostics.response.status === 401, 'contact_diagnostics_not_protected')
  assert(Object.keys(diagnostics.body || {}).sort().join(',') === 'reason,status', 'contact_diagnostics_exposes_internal_fields')
  assert(diagnostics.body?.status === 'error', 'contact_diagnostics_wrong_status')
  assert(diagnostics.body?.reason === 'operator_auth_required', 'contact_diagnostics_wrong_reason')

  console.log(JSON.stringify({
    ok: true,
    contract: 'supermega_public_contact_handoff_health',
    base_url: normalizedBaseUrl.origin,
    capture_status: status.body.status,
    diagnostics: 'protected',
    durable_write: 'not_asserted',
    writes_performed: false,
  }))
} catch (error) {
  fail(error?.message || 'contact_handoff_probe_failed')
}

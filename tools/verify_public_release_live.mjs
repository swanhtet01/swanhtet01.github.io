const attempts = 6
const requestTimeoutMs = 12_000
const retryDelayMs = 5_000

const endpoints = {
  home: 'https://supermega.dev/',
  www: 'https://www.supermega.dev/',
  agentIntake: 'https://supermega.dev/contact/?from=ai-agent-solution',
  health: 'https://supermega.dev/api/health',
  contactStatus: 'https://supermega.dev/api/contact-submissions/status',
}

function assert(condition, code) {
  if (!condition) throw new Error(code)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function get(url, accept) {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    cache: 'no-store',
    headers: {
      accept,
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'user-agent': 'SuperMegaVerifiedRelease/1.0',
    },
    signal: AbortSignal.timeout(requestTimeoutMs),
  })
  assert(response.ok, `http_${response.status}_${new URL(url).pathname}`)
  return response
}

function verifyHome(html, label) {
  for (const required of [
    '<title>supermega.dev | Shop, Plant and AI Agent Solutions</title>',
    '<h1 id="portfolio-heading">Shop. Plant. AI Agent Solutions.</h1>',
    'href="/contact/?from=ai-agent-solution"',
    'Build an agent solution',
  ]) {
    assert(html.includes(required), `${label}_missing_${required.slice(0, 32)}`)
  }
  for (const forbidden of ['MegaOS', 'DeskPOS', 'General enquiry']) {
    assert(!html.includes(forbidden), `${label}_retired_${forbidden}`)
  }
}

function verifyAgentIntake(html) {
  for (const required of [
    "search.get('from')==='ai-agent-solution'",
    'What should your agent handle every week?',
    'What does your team repeat?',
    'one redacted sample and one reviewed output',
    'Request first proof',
    'action="/api/contact-submissions"',
  ]) {
    assert(html.includes(required), `agent_intake_missing_${required.slice(0, 32)}`)
  }
  for (const field of ['name', 'email', 'company', 'goal']) {
    assert(new RegExp(`<(?:input|textarea)[^>]*\\bname="${field}"`).test(html), `agent_intake_missing_field_${field}`)
  }
  for (const forbidden of [
    'name="workflow"',
    'name="requested_package"',
    'name="product_area"',
    '/site/agent-templates/',
    'General enquiry',
    'MegaOS',
    'DeskPOS',
  ]) {
    assert(!html.includes(forbidden), `agent_intake_retired_${forbidden}`)
  }
}

function verifyHealth(body) {
  assert(body?.ok === true, 'health_not_ok')
  assert(body?.status === 'ready', 'health_not_ready')
  assert(body?.service === 'supermega-public-site', 'health_wrong_service')
  assert(body?.integrations?.email === true, 'health_owner_email_missing')
}

function verifyContactStatus(body) {
  assert(body?.status === 'ready', 'contact_status_not_ready')
  assert(body?.endpoint === 'contact-submissions', 'contact_status_wrong_endpoint')
  assert(['configured', 'ready'].includes(body?.lead_ledger), 'contact_lead_ledger_missing')
  assert(['configured', 'ready'].includes(body?.pipeline_actions), 'contact_action_queue_missing')
  assert(body?.fallback_queue?.email_delivery === 'configured', 'contact_email_fallback_missing')
  assert(body?.ops_intake?.status === 'ready', 'contact_ops_handoff_missing')
  assert(body?.setup_checklist?.supabase === 'configured', 'contact_supabase_missing')
  assert(body?.setup_checklist?.resend_api_key === 'configured', 'contact_resend_missing')
}

async function verifyOnce() {
  const [homeResponse, wwwResponse, intakeResponse, healthResponse, statusResponse] = await Promise.all([
    get(endpoints.home, 'text/html'),
    get(endpoints.www, 'text/html'),
    get(endpoints.agentIntake, 'text/html'),
    get(endpoints.health, 'application/json'),
    get(endpoints.contactStatus, 'application/json'),
  ])

  const [home, www, intake, health, contactStatus] = await Promise.all([
    homeResponse.text(),
    wwwResponse.text(),
    intakeResponse.text(),
    healthResponse.json(),
    statusResponse.json(),
  ])

  verifyHome(home, 'home')
  verifyHome(www, 'www')
  verifyAgentIntake(intake)
  verifyHealth(health)
  verifyContactStatus(contactStatus)
}

let lastError
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await verifyOnce()
    console.log(JSON.stringify({
      ok: true,
      contract: 'supermega_public_verified_release',
      attempts_used: attempt,
      endpoints_checked: Object.keys(endpoints),
      writes_performed: false,
    }))
    process.exit(0)
  } catch (error) {
    lastError = error
    if (attempt < attempts) {
      console.warn(`public_release_probe_retry=${attempt} reason=${error.message}`)
      await sleep(retryDelayMs)
    }
  }
}

console.error(JSON.stringify({
  ok: false,
  contract: 'supermega_public_verified_release',
  reason: lastError?.message || 'unknown_failure',
  writes_performed: false,
}))
process.exit(1)

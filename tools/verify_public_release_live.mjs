const attempts = 6
const requestTimeoutMs = 12_000
const retryDelayMs = 5_000

const endpoints = {
  home: 'https://supermega.dev/',
  www: 'https://www.supermega.dev/',
  work: 'https://supermega.dev/work/',
  contact: 'https://supermega.dev/contact/',
  retiredReconcile: 'https://supermega.dev/reconcile/',
  health: 'https://supermega.dev/api/health',
  contactStatus: 'https://supermega.dev/api/contact-submissions/status',
  contactDiagnostics: 'https://supermega.dev/api/contact-submissions/status?detail=1',
}

function assert(condition, code) {
  if (!condition) throw new Error(code)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function request(url, options = {}) {
  return fetch(url, {
    method: 'GET',
    redirect: options.redirect || 'follow',
    cache: 'no-store',
    headers: {
      accept: options.accept || 'text/html',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'user-agent': 'SuperMegaVerifiedRelease/1.0',
    },
    signal: AbortSignal.timeout(requestTimeoutMs),
  })
}

async function get(url, accept) {
  const response = await request(url, { accept })
  assert(response.ok, `http_${response.status}_${new URL(url).pathname}`)
  return response
}

const retiredPublicContent = ['MegaOS', 'DeskPOS', 'File Analyst', 'Payment Reconciler', 'data-clean-report-agent', 'supermega-machine.vercel.app/workcell', 'href="/reconcile/"', 'target="_blank"', 'target=_blank', 'window.open(', '>SM<']

function verifySharedPage(html, label) {
  for (const required of ['data-theme="light"', 'data-theme="dark"', 'data-theme-toggle', 'class="terminal-mark"', 'supermega<span class="domain">.dev</span>', '>Start a workflow</a>']) {
    assert(html.includes(required), `${label}_missing_${required.slice(0, 32)}`)
  }
  for (const forbidden of retiredPublicContent) {
    assert(!html.includes(forbidden), `${label}_retired_${forbidden}`)
  }
}

function verifyHome(html, label) {
  verifySharedPage(html, label)
  for (const required of [
    '<title>supermega.dev | Shop and Plant, ready for real work.</title>',
    '<h1 id="portfolio-heading">Run the day. Keep the handoffs.</h1>',
    'href="/work/"',
    '<h2 id="workspaces-heading">Start with the work that matters.</h2>',
    'Two working systems',
    'Built-in AI drafts, checks, and brings the next decision forward while approval stays with your team.',
    'data-product-preview',
    'href="/contact/?from=homepage-private-setup"',
    '>Private setup</a>',
    'src="/live-shop-workspace.png"',
    "src:'/live-plant-workspace.png'",
    'class="hero-product-picker"',
    'data-product-preview-description',
    '>Open Shop demo</a>',
    '<h2 id="brief-heading">Bring us the handoff that still breaks.</h2>',
    '>Start with one workflow</a>',
  ]) {
    assert(html.includes(required), `${label}_missing_${required.slice(0, 32)}`)
  }
}

function verifyWork(html) {
  verifySharedPage(html, 'work')
  for (const required of [
    '<title>Work | supermega.dev</title>',
    '<h1 id="work-heading">See the work before the pitch.</h1>',
    'Open Shop or Plant in the same tab and follow a real operating path.',
    'class="work-stage"',
    'class="work-product-picker"',
    'data-product-preview',
    'data-preview-proof-link',
    'data-product-preview-description',
    '>Open Shop demo</a>',
    'class="work-proof"',
    'class="work-proof-toolbar"',
    'aria-label="Open the live Shop workspace"',
    'fetchpriority="high"',
    '<h2 id="shop-case-heading">Keep the day together.</h2>',
    '<h2 id="plant-case-heading">Give the floor a memory.</h2>',
    'class="case-actions"',
    'href="/contact/?from=shop-workspace"',
    'href="/contact/?from=plant-workspace"',
    'src="/live-shop-workspace.png"',
    'src="/live-plant-workspace.png"',
    'srcset="/live-shop-mobile.png"',
    'srcset="/live-plant-mobile.png"',
    '<h2 id="work-close-heading">One useful workflow is enough to start.</h2>',
  ]) {
    assert(html.includes(required), `work_missing_${required.slice(0, 32)}`)
  }
}

function verifyContact(html) {
  verifySharedPage(html, 'contact')
  for (const required of ['What should run better?', 'action="/api/contact-submissions"', 'name="name"', 'name="email"', 'name="company"', 'name="goal"']) {
    assert(html.includes(required), `contact_missing_${required.slice(0, 32)}`)
  }
}

function verifyHealth(body) {
  assert(Object.keys(body || {}).sort().join(',') === 'ok,service,status', 'health_exposes_internal_fields')
  assert(body?.ok === true, 'health_not_ok')
  assert(body?.status === 'ready', 'health_not_ready')
  assert(body?.service === 'supermega-public-site', 'health_wrong_service')
}

function verifyContactStatus(body) {
  assert(Object.keys(body || {}).sort().join(',') === 'service,status', 'contact_status_exposes_internal_fields')
  assert(body?.status === 'ready', 'contact_status_not_ready')
  assert(body?.service === 'supermega-contact', 'contact_status_wrong_service')
}

function verifyProtectedDiagnostics(response, body) {
  assert(response.status === 401, 'contact_diagnostics_not_protected')
  assert(Object.keys(body || {}).sort().join(',') === 'reason,status', 'contact_diagnostics_auth_exposes_fields')
  assert(body?.status === 'error', 'contact_diagnostics_auth_wrong_status')
  assert(body?.reason === 'operator_auth_required', 'contact_diagnostics_auth_wrong_reason')
}

async function verifyOnce() {
  const [homeResponse, wwwResponse, workResponse, contactResponse, reconcileResponse, healthResponse, statusResponse, diagnosticsResponse] = await Promise.all([
    get(endpoints.home, 'text/html'),
    get(endpoints.www, 'text/html'),
    get(endpoints.work, 'text/html'),
    get(endpoints.contact, 'text/html'),
    request(endpoints.retiredReconcile, { redirect: 'manual' }),
    get(endpoints.health, 'application/json'),
    get(endpoints.contactStatus, 'application/json'),
    request(endpoints.contactDiagnostics, { accept: 'application/json' }),
  ])

  assert(reconcileResponse.status === 308, 'retired_reconcile_not_redirected')
  assert(reconcileResponse.headers.get('location') === '/contact/?from=workflow', 'retired_reconcile_wrong_destination')

  const [home, www, work, contact, health, contactStatus, protectedDiagnostics] = await Promise.all([
    homeResponse.text(),
    wwwResponse.text(),
    workResponse.text(),
    contactResponse.text(),
    healthResponse.json(),
    statusResponse.json(),
    diagnosticsResponse.json(),
  ])

  verifyHome(home, 'home')
  verifyHome(www, 'www')
  verifyWork(work)
  verifyContact(contact)
  verifyHealth(health)
  verifyContactStatus(contactStatus)
  verifyProtectedDiagnostics(diagnosticsResponse, protectedDiagnostics)
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

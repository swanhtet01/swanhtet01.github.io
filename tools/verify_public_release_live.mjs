const attempts = 6
const requestTimeoutMs = 12_000
const retryDelayMs = 5_000

const endpoints = {
  home: 'https://supermega.dev/',
  www: 'https://www.supermega.dev/',
  fileAnalyst: 'https://supermega-machine.vercel.app/workcell',
  paymentReconciler: 'https://supermega.dev/reconcile/',
  agentIntake: 'https://supermega.dev/contact/?from=ai-agent-solution',
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
    '<title>supermega.dev | Operational software built to fit</title>',
    '<h1 id="portfolio-heading">Operational software, built to fit.</h1>',
    '<h2 id="workspaces-heading">Start close to the real work.</h2>',
    'data-product-preview',
    'data-preview-open',
    'src="/live-shop-workspace.png"',
    "src:'/live-plant-workspace.png'",
    'https://supermega-machine.vercel.app/workcell',
    'href="/reconcile/"',
    '<strong>AI Agent Solutions</strong>',
    'Use File Analyst to clean one export, or run Payment Reconciler now',
    'Sources stay in this browser and are never uploaded.',
    'Use working screens',
    'Your private workspace is configured and verified before handover.',
    'Start fresh or add approved business records when ready.',
    '<h2 id="brief-heading">Tell us where the workflow breaks.</h2>',
    '>Describe your workflow</a>',
    '<img src="/favicon.svg" alt="" width="64" height="64" />',
  ]) {
    assert(html.includes(required), `${label}_missing_${required.slice(0, 32)}`)
  }
  for (const forbidden of ['MegaOS', 'DeskPOS', 'General enquiry', 'target="_blank"', 'target=_blank', 'window.open(', 'rotate(', 'Build an agent solution', '>Agent solution<', 'Need a repeated task handled?', '>SM<', 'Run the operation. See what matters.', 'Open a workspace.', 'Try first. Add data later.', 'Need something different?', '[data-reveal] { opacity: 0', 'Use one account across desktop, tablet, and mobile.', 'Create a workspace only when you want to keep your work and use it across devices.', 'Create with email and password. Return with your password or an email code.']) {
    assert(!html.includes(forbidden), `${label}_retired_${forbidden}`)
  }
}

function verifyFileAnalyst(html) {
  for (const required of [
    '<title>File Analyst | SuperMega AI Agent Solutions</title>',
    'zero source upload',
    'id="approveButton"',
    'id="downloadClean"',
  ]) {
    assert(html.includes(required), `file_analyst_missing_${required.slice(0, 32)}`)
  }
  for (const forbidden of ['MegaOS', 'DeskPOS']) {
    assert(!html.includes(forbidden), `file_analyst_retired_${forbidden}`)
  }
}

function verifyPaymentReconciler(html) {
  for (const required of [
    '<title>Payment Reconciler | SuperMega AI Agent Solutions</title>',
    'Zero source upload or money movement',
    'id="invoiceFile"',
    'id="paymentFile"',
    'id="approveButton"',
    'id="downloadReconciliation"',
    'src="/reconcile/payment-reconciler.mjs"',
  ]) {
    assert(html.includes(required), `payment_reconciler_missing_${required.slice(0, 32)}`)
  }
  for (const forbidden of ['MegaOS', 'DeskPOS', 'target="_blank"', 'window.open(', 'connect your bank']) {
    assert(!html.includes(forbidden), `payment_reconciler_retired_${forbidden}`)
  }
}

function verifyAgentIntake(html) {
  for (const required of [
    "entryIntent==='ai-agent-solution'",
    "entryIntent==='shop-workspace'?'Shop':entryIntent==='plant-workspace'?'Plant':''",
    'What do you want to improve?',
    'What should work better?',
    'one reviewed example',
    "idleSubmitLabel='Contact us'",
    "text('[data-contact-heading]','Request a private '+workspaceProduct+' workspace.')",
    "idleSubmitLabel='Request workspace'",
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
  const [homeResponse, wwwResponse, fileAnalystResponse, paymentReconcilerResponse, intakeResponse, healthResponse, statusResponse, diagnosticsResponse] = await Promise.all([
    get(endpoints.home, 'text/html'),
    get(endpoints.www, 'text/html'),
    get(endpoints.fileAnalyst, 'text/html'),
    get(endpoints.paymentReconciler, 'text/html'),
    get(endpoints.agentIntake, 'text/html'),
    get(endpoints.health, 'application/json'),
    get(endpoints.contactStatus, 'application/json'),
    fetch(endpoints.contactDiagnostics, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        'user-agent': 'SuperMegaVerifiedRelease/1.0',
      },
      signal: AbortSignal.timeout(requestTimeoutMs),
    }),
  ])

  const [home, www, fileAnalyst, paymentReconciler, intake, health, contactStatus, protectedDiagnostics] = await Promise.all([
    homeResponse.text(),
    wwwResponse.text(),
    fileAnalystResponse.text(),
    paymentReconcilerResponse.text(),
    intakeResponse.text(),
    healthResponse.json(),
    statusResponse.json(),
    diagnosticsResponse.json(),
  ])

  verifyHome(home, 'home')
  verifyHome(www, 'www')
  verifyFileAnalyst(fileAnalyst)
  verifyPaymentReconciler(paymentReconciler)
  verifyAgentIntake(intake)
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

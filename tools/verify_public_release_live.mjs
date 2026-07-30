import { readFile } from 'node:fs/promises'

const manifest = JSON.parse(await readFile(new URL('../site-manifest.json', import.meta.url), 'utf8'))
const baseUrl = String(process.env.PUBLIC_BASE_URL || manifest.release.productionDomain).replace(/\/$/, '')
const expectedCommit = String(process.env.EXPECTED_RELEASE_COMMIT || '').toLowerCase()
const attempts = Number(process.env.PUBLIC_VERIFY_ATTEMPTS || 6)
const retryDelayMs = Number(process.env.PUBLIC_VERIFY_RETRY_MS || 5000)
const timeoutMs = Number(process.env.PUBLIC_VERIFY_TIMEOUT_MS || 15000)

function assert(condition, code, detail = {}) {
  if (!condition) throw new Error(`${code}:${JSON.stringify(detail)}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function url(path, origin = baseUrl) {
  return new URL(path, `${origin}/`).href
}

async function request(path, options = {}) {
  return fetch(url(path, options.origin), {
    redirect: options.redirect || 'follow',
    cache: 'no-store',
    headers: {
      accept: options.accept || 'text/html,application/json',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'user-agent': 'SuperMegaVerifiedRelease/2.0',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
}

async function readPage(route) {
  const response = await request(route)
  assert(response.status === 200, 'page_http_error', { route, status: response.status })
  const csp = response.headers.get('content-security-policy') || ''
  assert(csp.includes("default-src 'self'")
    && csp.includes("frame-ancestors 'none'")
    && csp.includes("script-src-attr 'none'")
    && csp.includes("style-src-attr 'none'")
    && /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/.test(csp)
    && /style-src 'self' 'sha256-[A-Za-z0-9+/=]+'/.test(csp)
    && !csp.includes("'unsafe-inline'")
    && !csp.includes("'unsafe-eval'"), 'page_csp_wrong', { route, csp })
  for (const [name, value] of Object.entries({ 'cross-origin-opener-policy': 'same-origin', 'cross-origin-resource-policy': 'same-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' })) {
    assert(response.headers.get(name) === value, 'page_security_header_wrong', { route, name, expected: value, actual: response.headers.get(name) })
  }
  const html = await response.text()
  for (const token of [
    `meta name="supermega-brand-version" content="${manifest.brand.version}"`,
    `meta name="supermega-context-version" content="${manifest.contextVersion}"`,
    'aria-label="SuperMega home"',
    '<span class="brand-mark" aria-hidden="true">&gt;_</span>',
    'href="/contact/"',
    'href="/privacy/">Privacy</a>',
  ]) assert(html.includes(token), 'page_shared_contract_missing', { route, token })
  for (const token of manifest.retiredPublicNames) assert(!html.toLowerCase().includes(token.toLowerCase()), 'retired_context_live', { route, token })
  return html
}

async function readJson(path) {
  const response = await request(path, { accept: 'application/json' })
  assert(response.status === 200, 'json_http_error', { path, status: response.status })
  return { body: await response.json(), headers: response.headers }
}

async function verifyRedirect(path, destination) {
  const response = await request(path, { redirect: 'manual' })
  assert(response.status === 308, 'redirect_status_wrong', { path, status: response.status })
  const location = response.headers.get('location') || ''
  const expected = destination.startsWith('http') ? destination : url(destination)
  const actual = location.startsWith('http') ? location : url(location)
  assert(actual === expected, 'redirect_destination_wrong', { path, expected, actual })
}

async function verifyOnce() {
  const pageResults = await Promise.all(manifest.pages.map(async (page) => [page.route, await readPage(page.route)]))
  const pages = new Map(pageResults)
  assert(pages.get('/')?.includes(manifest.company.headline), 'homepage_headline_wrong')
  assert(pages.get('/')?.includes('href="#products">Choose a product</a>'), 'homepage_product_cta_missing')
  assert(pages.get('/')?.includes('id="products"'), 'product_portfolio_missing')
  const homepage = pages.get('/') || ''
  for (const product of manifest.customerProducts) {
    const legacyTrialRoute = `https://app.supermega.dev/settings/?product=${encodeURIComponent(product.id)}`
    assert(homepage.includes(`href="${product.appRoute}"`), 'direct_product_route_wrong', { product: product.id, appRoute: product.appRoute })
    assert(!homepage.includes(legacyTrialRoute), 'template_first_route_exposed', { product: product.id })
    for (const template of product.templates) assert(!homepage.includes(template.name), 'template_catalog_exposed', { template: template.id })
  }
  for (const internalLabel of ['SuperMega HQ', 'One next action for the company', 'Gated R&amp;D']) assert(!pages.get('/')?.includes(internalLabel), 'internal_system_exposed', { internalLabel })
  assert(pages.get('/')?.includes('id="trust"'), 'control_boundary_missing')
  const contactPage = pages.get('/contact/') || ''
  for (const token of ['supermega.managed_trial_proof.v2', 'data-trial-proof', 'Client-provided trial proof', 'name="proof_digest"', 'name="proof_readiness"', 'name="proof_sources"', 'name="proof_behavior"', 'name="proof_decisions"', 'proof_outcome', 'proof_outcome_digest', 'proof_outcome_accepted', 'digest-bound aggregate summary', 'trial_proof_invalid', 'Trial summary detached.', 'Request received:']) {
    assert(contactPage.includes(token), 'contact_trial_proof_contract_missing', { token })
  }
  const privacyPage = pages.get('/privacy/') || ''
  assert(privacyPage.includes('optional trial proof summary, outcome status, and digest') && privacyPage.includes('digest-bound aggregate outcome') && privacyPage.includes('excludes raw product records, questions, approval contents, and account details'), 'trial_proof_privacy_copy_missing')

  const [{ body: release, headers: releaseHeaders }, { body: health }, { body: contact }] = await Promise.all([
    readJson(manifest.release.releaseEndpoint),
    readJson('/api/health'),
    readJson('/api/contact-submissions/status'),
  ])
  assert(release.service === 'supermega-public-site', 'release_service_wrong', release)
  assert(/^[0-9a-f]{40}$/.test(String(release.commit || '')), 'release_commit_not_immutable', release)
  assert(release.brandVersion === manifest.brand.version, 'release_brand_version_wrong', release)
  assert(release.contextVersion === manifest.contextVersion, 'release_context_version_wrong', release)
  assert(release.catalogVersion === manifest.catalogVersion, 'release_catalog_version_wrong', release)
  if (expectedCommit) assert(release.commit === expectedCommit, 'release_commit_wrong', { expectedCommit, actual: release.commit })
  assert(/no-store/i.test(releaseHeaders.get('cache-control') || ''), 'release_metadata_cacheable')
  assert(health.ok === true && health.status === 'ready' && health.service === 'supermega-public-site', 'health_contract_wrong', health)
  assert(health.brand_version === manifest.brand.version && health.context_version === manifest.contextVersion && health.catalog_version === manifest.catalogVersion, 'health_version_wrong', health)
  assert(contact.status === 'ready' && contact.accepting === true, 'contact_not_accepting', contact)
  assert(contact.controls?.idempotency === 'required' && contact.controls?.edge_rate_limit === 'required' && contact.controls?.trial_proof === 'optional_client_provided', 'contact_controls_wrong', contact)

  await Promise.all([
    verifyRedirect('/products/shop/', '/#shop'),
    verifyRedirect('/products/factory/', '/#plant'),
    verifyRedirect('/products/ecommerce/', '/#ecommerce'),
    verifyRedirect('/ai-agent-solutions/', '/#products'),
    verifyRedirect('/offers/', '/#products'),
    verifyRedirect('/solutions/', '/#products'),
    verifyRedirect('/trust/', '/#trust'),
    verifyRedirect('/demo/', 'https://app.supermega.dev/'),
  ])

  const www = await fetch('https://www.supermega.dev/', { redirect: 'follow', cache: 'no-store', headers: { 'user-agent': 'SuperMegaVerifiedRelease/2.0' }, signal: AbortSignal.timeout(timeoutMs) })
  assert(www.status === 200, 'www_http_error', { status: www.status })
  const wwwHtml = await www.text()
  assert(wwwHtml.includes(manifest.company.headline), 'www_release_drift')

  return { pages: manifest.pages.map((page) => page.route), release, contact: contact.status }
}

let lastError
let verified = false
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const result = await verifyOnce()
    console.log(JSON.stringify({ ok: true, contract: 'supermega_public_live_release', baseUrl, attempt, expectedCommit: expectedCommit || null, ...result }, null, 2))
    verified = true
    break
  } catch (error) {
    lastError = error
    if (attempt < attempts) {
      console.warn(`public_release_retry=${attempt} reason=${error.message}`)
      await sleep(retryDelayMs)
    }
  }
}

if (!verified) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_public_live_release', baseUrl, expectedCommit: expectedCommit || null, reason: lastError?.message || 'unknown_failure' }, null, 2))
  process.exitCode = 1
}

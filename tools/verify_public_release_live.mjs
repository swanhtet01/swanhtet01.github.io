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
  const html = await response.text()
  for (const token of [
    `meta name="supermega-brand-version" content="${manifest.brand.version}"`,
    `meta name="supermega-context-version" content="${manifest.contextVersion}"`,
    'aria-label="SuperMega home"',
    '<span class="brand-mark" aria-hidden="true">&gt;_</span>',
    'href="https://app.supermega.dev/">Open workspace</a>',
    'href="/contact/">Contact</a>',
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
  assert(pages.get('/')?.includes('Product is a working lifecycle, not another showcase page.'), 'product_team_workspace_missing')
  assert(pages.get('/')?.includes('https://app.supermega.dev/operations/commerce/?tab=today'), 'commerce_workspace_wrong')
  assert(pages.get('/')?.includes('https://app.supermega.dev/operations/production/?tab=today'), 'production_workspace_wrong')
  for (const product of manifest.products) for (const template of product.templates) assert(pages.get('/')?.includes(template.name), 'template_catalog_missing', { template: template.id })
  assert(pages.get('/')?.includes('id="trust"'), 'control_boundary_missing')

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
  assert(contact.controls?.idempotency === 'required' && contact.controls?.edge_rate_limit === 'required', 'contact_controls_wrong', contact)

  await Promise.all([
    verifyRedirect('/products/shop/', '/#commerce'),
    verifyRedirect('/products/factory/', '/#production'),
    verifyRedirect('/ai-agent-solutions/', '/#product'),
    verifyRedirect('/offers/', '/#product'),
    verifyRedirect('/solutions/', '/#product'),
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
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const result = await verifyOnce()
    console.log(JSON.stringify({ ok: true, contract: 'supermega_public_live_release', baseUrl, attempt, expectedCommit: expectedCommit || null, ...result }, null, 2))
    process.exit(0)
  } catch (error) {
    lastError = error
    if (attempt < attempts) {
      console.warn(`public_release_retry=${attempt} reason=${error.message}`)
      await sleep(retryDelayMs)
    }
  }
}

console.error(JSON.stringify({ ok: false, contract: 'supermega_public_live_release', baseUrl, expectedCommit: expectedCommit || null, reason: lastError?.message || 'unknown_failure' }, null, 2))
process.exit(1)

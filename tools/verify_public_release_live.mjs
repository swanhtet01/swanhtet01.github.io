import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { activeProductContracts } from '../showroom/src/core/product-visibility.ts'
import { brandMarkHtml } from './public_company_shop_design.mjs'
import { NATIVE_SHOP_GALLERY_DIR, verifyNativeShopGallery } from './public_native_shop_gallery.mjs'
import { parsePreviewAppBinding } from './public_preview_navigation.mjs'

const verifyCurrentHead = process.argv.includes('--current-head')
const configuredExpectedCommit = String(process.env.EXPECTED_RELEASE_COMMIT || '').trim().toLowerCase()

function readCurrentHead() {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: resolve(import.meta.dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim().toLowerCase()
    if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('invalid_commit')
    return commit
  } catch {
    throw new Error('current_head_commit_unavailable')
  }
}

const currentHeadCommit = verifyCurrentHead ? readCurrentHead() : ''
if (configuredExpectedCommit && currentHeadCommit && configuredExpectedCommit !== currentHeadCommit) {
  throw new Error('configured_expected_commit_differs_from_current_head')
}
const expectedCommit = configuredExpectedCommit || currentHeadCommit
const verificationScope = expectedCommit ? 'exact_release' : 'availability_and_contract'
const manifest = JSON.parse(await readFile(new URL('../site-manifest.json', import.meta.url), 'utf8'))
const nativeShopGallery = verifyNativeShopGallery(resolve(import.meta.dirname, '..'))
const publicProducts = activeProductContracts(manifest)
const activeLandingPages = manifest.pages.filter(page => publicProducts.some(product => product.id === page.productId))
const retiredCustomerPages = manifest.pages.filter(page => page.productId && !publicProducts.some(product => product.id === page.productId))
const retiredCustomerRoutes = new Set(retiredCustomerPages.map(page => page.route))
const retiredCustomerPaths = retiredCustomerPages.flatMap(page => [
  `/${page.productId}`,
  `/${page.productId}/`,
  `/${page.productId}/index.html`,
  `/${page.productId}/settings/nested`,
].map(route => ({ route, productId: page.productId })))
const baseUrl = String(process.env.PUBLIC_BASE_URL || manifest.release.productionDomain).replace(/\/$/, '')
const attempts = Number(process.env.PUBLIC_VERIFY_ATTEMPTS || (verifyCurrentHead ? 1 : 6))
const retryDelayMs = Number(process.env.PUBLIC_VERIFY_RETRY_MS || 5000)
const timeoutMs = Number(process.env.PUBLIC_VERIFY_TIMEOUT_MS || 15000)
let appOrigin = 'https://app.supermega.dev'

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
    redirect: options.redirect || 'error',
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
  for (const [name, value] of Object.entries({ 'cross-origin-opener-policy': 'same-origin', 'cross-origin-resource-policy': 'same-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' })) {
    assert(response.headers.get(name) === value, 'page_security_header_wrong', { route, name, expected: value, actual: response.headers.get(name) })
  }
  const html = await response.text()
  const isMyanmarPage = route.startsWith('/my/')
  for (const token of [
    `meta name="supermega-brand-version" content="${manifest.brand.version}"`,
    `meta name="supermega-context-version" content="${manifest.contextVersion}"`,
    'aria-label="SuperMega"',
    `class="brand-mark" aria-hidden="true">${brandMarkHtml}</span>`,
    isMyanmarPage
      ? 'href="/my/privacy/">ကိုယ်ရေးအချက်အလက် မူဝါဒ</a>'
      : 'href="/privacy/">Privacy</a>',
  ]) assert(html.includes(token), 'page_shared_contract_missing', { route, token })
  const expectedSignInOpening = `<a class="nav-sign-in" href="${appOrigin}/login">`
  const expectedSignIn = `${expectedSignInOpening}${isMyanmarPage ? 'ဝင်ရန်' : 'Sign in'}</a>`
  const signInLinks = [...html.matchAll(/<a\b[^>]*\bhref="https:\/\/[^"]+\/login[^"]*"[^>]*>/gi)]
  assert(html.includes(expectedSignIn) && signInLinks.length === 1 && signInLinks[0][0] === expectedSignInOpening,
    'page_shop_sign_in_drift', { route })
  const contactRouteToken = isMyanmarPage
    ? 'href="/my/contact/">ဆက်သွယ်ရန်</a>'
    : 'href="/contact/">Contact</a>'
  assert(html.includes(contactRouteToken), 'page_contact_route_missing', { route, token: contactRouteToken })
  const copyWithoutExternalDestinations = html.replace(/\bhref="https?:\/\/[^\"]+"/gi, '')
  for (const token of manifest.retiredPublicNames) assert(!copyWithoutExternalDestinations.toLowerCase().includes(token.toLowerCase()), 'retired_context_live', { route, token })
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

// Pages marked liveGate: "post-release" ship with a release, so before that release is
// promoted the deployed site legitimately serves a redirect or 404 for them. Without an
// exact expected commit (availability scope) those routes are skipped while pending; the
// post-deploy release verification always runs with EXPECTED_RELEASE_COMMIT set, which
// asserts every manifest page — including gated landing pages — against the promoted build.
async function readPageOrPending(page, pendingRoutes) {
  if (page.liveGate === 'post-release' && !expectedCommit) {
    const probe = await request(page.route, { redirect: 'manual' })
    if (probe.status !== 200) {
      pendingRoutes.add(page.route)
      return [page.route, null]
    }
  }
  return [page.route, await readPage(page.route)]
}

async function verifyOnce() {
  const { body: release, headers: releaseHeaders } = await readJson(manifest.release.releaseEndpoint)
  if (expectedCommit && release.commit !== expectedCommit) assert(false, 'release_commit_wrong', { expectedCommit, actual: release.commit })
  const previewAppBinding = release.previewNavigation
    ? parsePreviewAppBinding(JSON.stringify(release.previewNavigation), release.commit, expectedCommit || release.commit)
    : null
  appOrigin = previewAppBinding?.origin || 'https://app.supermega.dev'
  const pendingRoutes = new Set()
  const pageResults = await Promise.all(manifest.pages.filter(page => !page.redirectTo && !retiredCustomerRoutes.has(page.route)).map(async (page) => readPageOrPending(page, pendingRoutes)))
  const pages = new Map([...pageResults, ...retiredCustomerPages.map(page => [page.route, null])])
  const rootResponse = await request('/', { redirect: 'manual' })
  if (rootResponse.status === 308) {
    assert(new URL(rootResponse.headers.get('location') || '', `${baseUrl}/`).href === url('/shop/'), 'root_redirect_destination_wrong')
    if (expectedCommit) await verifyRedirect('/index.html', '/shop/')
  } else if (!expectedCommit && rootResponse.status === 200) {
    pendingRoutes.add('/')
  } else {
    assert(false, 'root_redirect_status_wrong', { status: rootResponse.status })
  }
  await Promise.all(retiredCustomerPaths.map(async page => {
    const response = await request(page.route, { redirect: 'manual' })
    if (response.status !== 404) {
      if (expectedCommit) assert(false, 'retired_product_route_not_found', { route: page.route, product: page.productId, status: response.status })
      pendingRoutes.add(page.route)
      return
    }
    const body = await response.text()
    const product = manifest.customerProducts.find(item => item.id === page.productId)
    assert(!product || !body.toLowerCase().includes(product.name.toLowerCase()), 'retired_product_content_served', { route: page.route, product: page.productId })
  }))
  const shop = publicProducts.find(product => product.id === 'shop')
  const shopAction = `href="${shop.primaryCta.url}">${shop.primaryCta.label}</a>`
  for (const product of publicProducts) {
    const landingRoute = `/${product.id}/`
    const landing = pages.get(landingRoute)
    if (pendingRoutes.has(landingRoute) || landing == null) continue
    if (product.id === 'shop') {
      assert(landing.includes('class="native-shop-gallery"')
        && landing.includes('src="/images/native-shop/shop_checkout_1200_en.png"'), 'landing_headline_missing', { product: product.id })
    } else {
      assert(landing.includes('class="platform-image"'), 'landing_headline_missing', { product: product.id })
    }
    const appLinks = [...landing.matchAll(/href="https:\/\/[^"]+"/g)].map(match => match[0])
      .filter(href => href.startsWith(`href="${appOrigin}/`) || href.startsWith('href="https://app.supermega.dev/'))
    assert(appLinks.length === 1 && appLinks[0] === `href="${appOrigin}/login"`,
      'landing_public_app_action_drift', { product: product.id, appLinks })
    if (product.id === 'shop') {
      assert(landing.includes(shopAction), 'shop_manifest_action_missing')
      assert(landing.includes('href="/contact/?product=shop">Start with Shop'), 'shop_contact_action_missing')
    }
    assert(landing.includes('href="/contact/">Contact</a>'), 'landing_contact_route_missing', { product: product.id })
  }
  const contactPage = pages.get('/contact/') || ''
  if (expectedCommit) assert(contactPage.includes(manifest.company.statement), 'contact_company_intro_missing')
  for (const token of ['supermega.managed_trial_proof.v2', 'data-trial-proof', 'name="product" value="guide"', 'name="proof_digest"', 'name="proof_readiness"', 'name="proof_behavior"', 'name="proof_sources"', 'name="proof_decisions"', 'proof_outcome', 'proof_outcome_digest', 'proof_outcome_accepted', 'digest-bound aggregate summary', 'trial_proof_invalid', 'Attached context removed because the product changed.', 'Message received:', 'source.value=location.href', '>Send message</button>']) {
    assert(contactPage.includes(token), 'contact_trial_proof_contract_missing', { token })
  }
  for (const token of ['Request managed company intelligence.', "submit.textContent='Request managed pilot'", 'managedIntelligenceRequest']) {
    assert(!contactPage.includes(token), 'retired_managed_pilot_pitch_present', { token })
  }
  const privacyPage = pages.get('/privacy/') || ''
  assert(privacyPage.includes('optional attached request summary, outcome status, and digest') && privacyPage.includes('digest-bound aggregate outcome') && privacyPage.includes('excludes raw product records, questions, approval contents, and account details'), 'trial_proof_privacy_copy_missing')

  // The share-and-schema surface (og-card asset, og:image/twitter metadata,
  // JSON-LD structured data, skip-to-content link) ships with a release, exactly
  // like liveGate: "post-release" landing pages above: before that release is
  // promoted the deployed site legitimately serves pages without it. Without an
  // exact expected commit (availability scope) the surface is probed and skipped
  // while pending; the post-deploy release verification always runs with
  // EXPECTED_RELEASE_COMMIT set, which asserts the full surface.
  const pendingFeatures = new Set()
  const shareImage = new URL('/og-card.png', `${manifest.release.productionDomain}/`).href
  const shareSchemaLive = (pages.get('/shop/') || '').includes('/og-card-shop.png')
  if (!shareSchemaLive && !expectedCommit) {
    pendingFeatures.add('share-and-schema')
  } else {
    const jsonLdSchemas = (html, route) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => {
      try {
        return JSON.parse(match[1])
      } catch {
        assert(false, 'structured_data_not_json', { route })
        return null
      }
    })
    // Per-product share cards (og:image = /og-card-<productId>.png on each
    // landing page) ship with a release under the same liveGate: "post-release"
    // pattern: without an exact expected commit the previously released
    // generic-card surface stays valid while the per-product release is
    // pending; the post-deploy release verification always runs with
    // EXPECTED_RELEASE_COMMIT set, which asserts the per-product surface.
    const landingShareImages = new Map(activeLandingPages.flatMap((entry) => {
      const image = new URL(`/og-card-${entry.productId}.png`, `${manifest.release.productionDomain}/`).href
      return [[entry.route, image], [`/my${entry.route}`, image]]
    }))
    const loadedLandingRoutes = [...landingShareImages.keys()].filter((route) => pages.get(route) != null)
    const perProductCardsLive = loadedLandingRoutes.length > 0 && loadedLandingRoutes.every((route) => pages.get(route).includes(landingShareImages.get(route)))
    const perProductCardsActive = Boolean(expectedCommit) || perProductCardsLive
    if (!perProductCardsActive) pendingFeatures.add('per-product-share-cards')
    for (const [route, html] of pages) {
      if (html == null) continue
      const expectedShareImage = perProductCardsActive && landingShareImages.has(route) ? landingShareImages.get(route) : shareImage
      assert(html.includes(`<meta property="og:image" content="${expectedShareImage}" />`)
        && html.includes('<meta property="og:image:width" content="1200" />')
        && html.includes('<meta property="og:image:height" content="630" />'), 'page_share_image_missing', { route })
      assert(html.includes('<meta name="twitter:card" content="summary_large_image" />')
        && html.includes(`<meta name="twitter:image" content="${expectedShareImage}" />`), 'page_twitter_card_wrong', { route })
      const skipLink = route.startsWith('/my/')
        ? '<a class="skip-link" href="#content">အကြောင်းအရာသို့ သွားရန်</a>'
        : '<a class="skip-link" href="#content">Skip to content</a>'
      assert(html.includes(skipLink) && html.includes('id="content"'), 'page_skip_link_missing', { route })
    }
    for (const page of activeLandingPages) {
      const landing = pages.get(page.route)
      if (landing == null) continue
      const product = manifest.customerProducts.find((candidate) => candidate.id === page.productId)
      const [schema, ...extraSchemas] = jsonLdSchemas(landing, page.route)
      assert(extraSchemas.length === 0
        && schema?.['@type'] === 'Product'
        && schema?.name === product.name
        && schema?.url === new URL(page.route, `${manifest.release.productionDomain}/`).href
        && schema?.description === (page.description || product.description), 'product_schema_wrong_live', { route: page.route, schema })
    }
    const cardPaths = ['/og-card.png', ...(perProductCardsActive ? activeLandingPages.map((entry) => `/og-card-${entry.productId}.png`) : [])]
    await Promise.all(cardPaths.map(async (path) => {
      const card = await request(path, { accept: 'image/png' })
      assert(card.status === 200, 'share_image_http_error', { path, status: card.status })
      assert((card.headers.get('content-type') || '').includes('image/png'), 'share_image_content_type_wrong', { path, contentType: card.headers.get('content-type') })
    }))
  }

  // The screenshots are part of the release, not optional decoration. Verify
  // their actual response bytes; a 200 HTML fallback must never pass as an image.
  assert(publicProducts.map(product => product.id).join(',') === 'shop', 'public_product_scope_not_shop_only')
  for (const [route, files] of Object.entries({
    '/shop/': ['shop_checkout_1200_en.png', 'shop_checkout_820_en.png', 'shop_stock_820_en.png', 'shop_today_820_en.png'],
    '/my/shop/': ['shop_checkout_1200_my.png', 'shop_checkout_820_my.png', 'shop_stock_820_my.png', 'shop_today_820_my.png'],
  })) {
    const html = pages.get(route)
    if (html == null) continue
    for (const file of files) {
      const path = `/images/native-shop/${file}`
      assert(html.includes(path), 'interface_image_reference_missing', { route, path })
    }
  }
  for (const asset of nativeShopGallery.assets.filter(asset => /^(?:shop_checkout_1200|shop_checkout_820|shop_stock_820|shop_today_820)_(?:en|my)\.png$/.test(asset.file))) {
    const path = `/images/native-shop/${asset.file}`
    const response = await request(path, { accept: 'image/png' })
    assert(response.status === 200, 'interface_image_http_error', { path, status: response.status })
    assert((response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() === 'image/png', 'interface_image_content_type_wrong', { path })
    const bytes = Buffer.from(await response.arrayBuffer())
    assert(bytes.length > 10000 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'interface_image_invalid', { path })
    assert(createHash('sha256').update(bytes).digest('hex') === asset.sha256, 'interface_image_release_mismatch', { path })
  }

  const [{ body: health }, { body: contact }] = await Promise.all([
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

  // Retired public API surface. The legacy ops endpoints (for example
  // /api/pipeline-control/status) were deliberately removed in the public-site
  // consolidation (f8c5299e). The live contract for anonymous requests is
  // 404 {"status":"not_found"} — not the retired ops-key 401 — because the
  // endpoints no longer exist and carry no auth surface.
  await Promise.all(['/api/pipeline-control/status', '/api/pipeline-control'].map(async (path) => {
    const retired = await request(path, { accept: 'application/json' })
    assert(retired.status === 404, 'retired_api_status_wrong', { path, status: retired.status })
    const retiredBody = await retired.json().catch(() => null)
    assert(retiredBody !== null && retiredBody.status === 'not_found' && Object.keys(retiredBody).length === 1, 'retired_api_body_wrong', { path, retiredBody })
  }))

  await Promise.all([
    verifyRedirect('/products/shop/', '/shop/'),
    verifyRedirect('/products/factory/', '/plant/'),
    verifyRedirect('/products/ecommerce/', publicProducts.some(product => product.id === 'ecommerce') ? '/#ecommerce' : '/ecommerce/'),
    verifyRedirect('/ai-agent-solutions/', '/shop/'),
    verifyRedirect('/offers/', '/shop/'),
    verifyRedirect('/solutions/', '/shop/'),
    verifyRedirect('/trust/', '/contact/'),
    verifyRedirect('/demo/', 'https://app.supermega.dev/'),
  ])

  const www = await fetch('https://www.supermega.dev/', { redirect: 'follow', cache: 'no-store', headers: { 'user-agent': 'SuperMegaVerifiedRelease/2.0' }, signal: AbortSignal.timeout(timeoutMs) })
  assert(www.status === 200, 'www_http_error', { status: www.status })
  const wwwHtml = await www.text()
  if (expectedCommit) assert(wwwHtml.includes('class="native-shop-gallery"'), 'www_shop_redirect_drift')

  return {
    pages: manifest.pages.map((page) => page.route).filter((route) => !retiredCustomerRoutes.has(route) && !pendingRoutes.has(route)),
    pendingGatedRoutes: [...pendingRoutes],
    pendingGatedFeatures: [...pendingFeatures],
    release,
    contact: contact.status,
  }
}

let lastError
let verified = false
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const result = await verifyOnce()
    console.log(JSON.stringify({ ok: true, contract: 'supermega_public_live_release', baseUrl, verificationScope, attempt, expectedCommit: expectedCommit || null, ...result }, null, 2))
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
  console.error(JSON.stringify({ ok: false, contract: 'supermega_public_live_release', baseUrl, verificationScope, expectedCommit: expectedCommit || null, reason: lastError?.message || 'unknown_failure' }, null, 2))
  process.exitCode = 1
}

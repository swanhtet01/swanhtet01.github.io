import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative, resolve } from 'node:path'
import { activeProductContracts } from '../showroom/src/core/product-visibility.ts'
import { parsePreviewAppBinding } from './public_preview_navigation.mjs'
import { publicGalleryReleaseReadinessError } from './public_gallery_rights.mjs'

const root = process.cwd()
const isolatedOutputId = process.env.SUPERMEGA_PUBLIC_OUTPUT_ID || ''
if (isolatedOutputId && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(isolatedOutputId)) throw new Error('public_output_id_invalid')
const outputDir = isolatedOutputId
  ? resolve(root, '.tmp', `supermega-public-output-${isolatedOutputId}`)
  : resolve(root, '.vercel', 'output')
const staticDir = resolve(outputDir, 'static')
const functionsDir = resolve(outputDir, 'functions', 'api')
const configPath = resolve(outputDir, 'config.json')
const manifest = JSON.parse(readFileSync(resolve(root, 'site-manifest.json'), 'utf8'))
const publicGalleryProvenance = JSON.parse(readFileSync(resolve(root, 'tools', 'public-assets', 'public-gallery-provenance.json'), 'utf8'))
const publicGalleryCapture = JSON.parse(readFileSync(resolve(root, 'tools', 'public-assets', 'public-gallery-capture.json'), 'utf8'))
const publicGalleryImageSources = JSON.parse(readFileSync(resolve(root, 'tools', 'qa-assets', 'shop-products', 'sources.json'), 'utf8'))

function fail(code, detail = {}) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_public_output', code, ...detail }, null, 2))
  process.exit(1)
}

const builderSource = readFileSync(resolve(root, 'tools', 'create_public_vercel_output.mjs'), 'utf8')
const publicReleaseWorkflow = readFileSync(resolve(root, '.github', 'workflows', 'supermega-public-release.yml'), 'utf8')
if (!builderSource.includes("process.env.SUPERMEGA_PUBLIC_RELEASE === '1' || process.env.VERCEL === '1'")
  || !builderSource.includes('assertPublicGalleryReleaseReady(publicGalleryCapture, publicGalleryImageSources)')
  || !publicReleaseWorkflow.includes("SUPERMEGA_PUBLIC_RELEASE: '1'")) {
  fail('public_gallery_release_gate_not_wired')
}
if (publicGalleryReleaseReadinessError(publicGalleryCapture, publicGalleryImageSources)
  !== 'public_gallery_capture_not_publication_ready'
  || publicGalleryReleaseReadinessError({ publicationReady: true }, publicGalleryImageSources)
    !== 'public_gallery_image_rights_unverified') {
  fail('public_gallery_release_gate_not_fail_closed')
}
const reviewedRights = {
  status: 'cleared_for_publication',
  basis: 'cc-by-4.0',
  license_url: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Example photographer — CC BY 4.0',
  reviewed_at: '2026-10-21',
  reviewed_by: 'founder',
  evidence_sha256: 'a'.repeat(64),
}
const reviewedImageSet = {
  schemaVersion: 'supermega.shop-image-rights.v1',
  status: 'cleared_for_publication',
  products: [{ file: 'example.webp', source_page: 'https://example.com/photo', publication_rights: reviewedRights }],
}
if (publicGalleryReleaseReadinessError({ publicationReady: true }, reviewedImageSet) !== null) {
  fail('public_gallery_release_gate_rejects_reviewed_rights')
}
const missingEvidenceImageSet = structuredClone(reviewedImageSet)
delete missingEvidenceImageSet.products[0].publication_rights.evidence_sha256
if (publicGalleryReleaseReadinessError({ publicationReady: true }, missingEvidenceImageSet)
  !== 'public_gallery_image_rights_unverified') {
  fail('public_gallery_release_gate_accepts_incomplete_rights')
}

function requireFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) fail('required_file_missing', { label, path })
}

function readStatic(path) {
  const fullPath = resolve(staticDir, path)
  requireFile(fullPath, path)
  return readFileSync(fullPath, 'utf8')
}

const release = JSON.parse(readStatic('__release.json'))
const previewAppBinding = release.previewNavigation
  ? parsePreviewAppBinding(JSON.stringify(release.previewNavigation), release.commit, release.commit)
  : null
const appOrigin = previewAppBinding?.origin || 'https://app.supermega.dev'

function countOccurrences(value, token) {
  return value.split(token).length - 1
}

function hasClassToken(source, token) {
  return [...source.matchAll(/\bclass="([^"]+)"/g)].some((match) => match[1].split(/\s+/).includes(token))
}

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name)
    return entry.isDirectory() ? walkFiles(fullPath) : [relative(staticDir, fullPath).replaceAll('\\', '/')]
  })
}

requireFile(configPath, 'config.json')
if (manifest.schemaVersion !== 'supermega.site-context.v2') fail('manifest_schema_changed')
if (manifest.company?.publicPricing !== false) fail('public_pricing_enabled')
if (manifest.release?.sourceBranch !== 'main') fail('release_source_not_main')
if (manifest.customerProducts?.map((product) => `${product.id}:${product.runtimeId}:${product.name}`).join(',') !== 'shop:commerce:Shop,plant:production:Plant,website:website:Sites,ecommerce:ecommerce:Commerce') fail('customer_product_portfolio_drift')
if (manifest.customerProducts?.map((product) => product.appRoute).join(',') !== 'https://app.supermega.dev/shop/,https://app.supermega.dev/plant/,https://app.supermega.dev/website/,https://app.supermega.dev/ecommerce/') fail('customer_product_routes_drift')
const operatingProducts = manifest.customerProducts?.filter((product) => product.kind === 'operating-product') || []
const makerProducts = manifest.customerProducts?.filter((product) => product.kind === 'maker-product') || []
const publicProducts = activeProductContracts(manifest)
const publicProductNames = publicProducts.map(product => product.name).join(', ')
const discoverablePages = manifest.pages.filter(page => !page.productId || publicProducts.some(product => product.id === page.productId))
const shop = publicProducts.find((product) => product.id === 'shop')
if (operatingProducts.map((product) => product.id).join(',') !== 'shop,plant') fail('operating_product_portfolio_drift')
if (makerProducts.map((product) => `${product.id}:${product.status}`).join(',') !== 'website:release-candidate-local,ecommerce:release-candidate-local') fail('maker_product_portfolio_drift')
const website = manifest.customerProducts?.find((product) => product.id === 'website')
if (website?.views?.join(',') !== 'Start,Edit,Preview,Download'
  || website?.templates?.some((template) => template.workflow?.at(-1) !== 'Download website')
  || website?.headline !== 'Make your business easy to find.') fail('website_download_trial_contract_drift')
const ecommerce = manifest.customerProducts?.find((product) => product.id === 'ecommerce')
if (ecommerce?.views?.join(',') !== 'Storefront,Cart and quote,Request receipt,Shop review,Returns'
  || !ecommerce?.workflow?.includes('Review a 15-minute whole-MMK quote')
  || !ecommerce?.proof?.includes('Deterministic 15-minute checkout quote')
  || !ecommerce?.proof?.includes('Recoverable cart and request state')
  || !ecommerce?.proof?.includes('Idempotent receipt and exact managed replay')
  || !ecommerce?.proof?.includes('Exact retained-ledger membership')
  || !ecommerce?.proof?.includes('Revision, action-identity, and cross-tenant conflict rejection')
  || !ecommerce?.proof?.includes('Bootstrap recovery')
  || !ecommerce?.proof?.includes('Human-confirmed source-locked Shop draft')
  || !ecommerce?.proof?.includes('Payment remains unauthorized before Shop')
  || !ecommerce?.proof?.includes('23 Ecommerce buying runtime checks')
  || !ecommerce?.boundaries?.includes('No isolated hosted tenant proof')
  || !ecommerce?.boundaries?.includes('Managed inbox uses a 100-entry revisioned Shop workspace pilot envelope; a normalized indexed queue is gated on measured scale')
  || !ecommerce?.boundaries?.includes('No Shop order or stock reservation before separate accountable confirmation')
  || !ecommerce?.boundaries?.includes('No payment authorization or charge')
  || !ecommerce?.boundaries?.includes('Delivery stays an intent until Shop confirms fee and fulfilment')
  || !ecommerce?.boundaries?.includes('Returns and refunds are completed in Shop')) fail('ecommerce_request_receipt_contract_drift')
if (manifest.sharedCapabilities?.map((capability) => `${capability.id}:${capability.status}`).join(',') !== 'ai-assistance:gated-r-and-d') fail('shared_capability_drift')
for (const product of publicProducts) {
  if (product.templates?.length !== 3) fail('public_template_count_wrong', { product: product.id })
  for (const template of product.templates || []) {
    if (!template.outcome?.trim() || !template.metric?.trim() || template.workflow?.length < 5 || template.entryPoints?.length < 3) fail('public_template_contract_incomplete', { product: product.id, template: template.id })
  }
}
if (manifest.pages?.map((page) => page.route).join(',') !== '/,/shop/,/plant/,/website/,/ecommerce/,/contact/,/privacy/') fail('public_page_surface_not_minimal')
for (const landingPage of manifest.pages.filter((page) => page.productId)) {
  if (landingPage.route !== `/${landingPage.productId}/` || landingPage.file !== `${landingPage.productId}/index.html`) fail('landing_page_route_drift', { route: landingPage.route })
  if (landingPage.liveGate !== 'post-release') fail('landing_page_live_gate_missing', { route: landingPage.route })
}

const expectedStaticFiles = new Set([
  ...manifest.pages.map((page) => page.file),
  '404.html',
  '__release.json',
  'favicon.svg',
  'fonts/noto-sans-latin.woff2',
  'fonts/noto-sans-latin-OFL.txt',
  'vercel-insights.js',
  'platform-carousel.js',
  'images/actual-shop-today.png',
  'images/actual-shop-sell.png',
  'images/actual-shop-sell-tablet.png',
  'images/actual-shop-sell-mobile.png',
  'images/actual-shop-orders.png',
  'images/actual-shop-orders-tablet.png',
  'images/actual-shop-orders-mobile.png',
  'images/actual-shop-inventory.png',
  'images/actual-shop-inventory-tablet.png',
  'images/actual-shop-inventory-mobile.png',
  'og-card.png',
  ...publicProducts.map((product) => `og-card-${product.id}.png`),
  'robots.txt',
  'site.webmanifest',
  'sitemap.xml',
])
const actualStaticFiles = walkFiles(staticDir)
for (const path of actualStaticFiles) {
  if (/^images\/actual-(?:sites|commerce)-/.test(path)) fail('internal_product_capture_in_public_output', { path })
}
for (const path of actualStaticFiles) {
  if (!expectedStaticFiles.has(path)) fail('unapproved_public_artifact', { path })
}
for (const path of expectedStaticFiles) {
  if (!actualStaticFiles.includes(path)) fail('expected_public_artifact_missing', { path })
}
for (const id of ['website', 'ecommerce']) {
  const page = readStatic(`${id}/index.html`)
  if (!publicProducts.some((product) => product.id === id)
    && (!page.includes('name="robots" content="noindex,follow"')
      || !page.includes('not offered for new setup')
      || page.includes('class="platform-image')
      || page.includes(`/images/actual-${id === 'website' ? 'sites' : 'commerce'}-`))) {
    fail('internal_product_page_exposed', { id })
  }
}

const sharedRequired = [
  `meta name="supermega-brand-version" content="${manifest.brand.version}"`,
  `meta name="supermega-context-version" content="${manifest.contextVersion}"`,
  `data-brand-version="${manifest.brand.version}"`,
  'href="/favicon.svg?v=',
  '<a class="skip-link" href="#content">Skip to content</a>',
  'id="content"',
  '.skip-link { position: fixed; z-index: 60; top: 12px; left: 12px; min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 10px 14px; border-radius: 10px; background: var(--ink); color: #ffffff; font-size: 13px; font-weight: 720; text-decoration: none; transform: translateY(-160%); }',
  '.skip-link:focus { transform: translateY(0); }',
  '.wrap { width: min(1260px, calc(100% - 64px)); margin-inline: auto; }',
  '.site-header { position: sticky; top: 0; z-index: 40; min-height: 76px; border-bottom: 1px solid var(--brand-line); background: rgba(255,255,255,.96); backdrop-filter: blur(18px); }',
  '.header-inner { min-height: 76px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }',
  '.nav-links { display: flex; min-width: 0; align-items: center; justify-content: flex-end; gap: 10px; }',
  '.nav-links a { min-height: 48px; display: inline-flex; align-items: center; border: 1px solid transparent; border-radius: 8px; padding: 0 15px; color: var(--brand-muted); font-size: .9rem; font-weight: 600; text-decoration: none; transition: color 160ms ease, background-color 160ms ease, border-color 160ms ease; }',
  'aria-label="SuperMega home"',
  '<nav class="nav-links" aria-label="Main navigation">',
  '<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 72 44" width="30" height="18" focusable="false"><path d="M10 9 26 22 10 35M35 35h27" fill="none" stroke="#2563eb" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>',
  '<span class="brand-word">SuperMega</span>',
  '<script src="/vercel-insights.js"></script>',
  'href="/privacy/">Privacy</a>',
  '--bg-raised: #f3f6fc;',
  '--ink: #151521;',
  '--blue: #2563eb;',
  'font-family: "SuperMega Noto Sans"',
  '--font-latin: "SuperMega Noto Sans"',
  '.platform-image figcaption {margin-top:auto;padding:12px 2px 0;color:#596579;font-size:12px;line-height:1.45}',
  '.platform-device-set {display:grid;grid-template-columns:minmax(0,1.75fr) minmax(0,1.25fr) minmax(0,.95fr);',
  '.platform-device-capture figcaption',
  '.brand-mark { width: 30px; height: 18px; display: inline-flex; flex: none; align-items: center; justify-content: center; border: 0; border-radius: 0; padding: 0; background: transparent; box-shadow: none; color: var(--brand-accent); }',
  '.contact-page .contact-form { width:100%; padding:clamp(24px,3vw,40px); gap:18px; border-color:#dbe3ee; border-radius:8px;',
]

const forbiddenCopy = [
  'Accountable company software.',
  'You stay in control',
  'You review before anything is published, sent or charged.',
  'Start when it is ready',
  'Managed activation proceeds only after',
  ...manifest.retiredPublicNames,
  'Custom software at SaaS prices',
  'Three products',
  'public agent',
  'agent company',
  'autonomous employee',
  'Vision',
  'foundry',
  'console.supermega.dev',
  'ops.supermega.dev',
  'ytf.supermega.dev',
  'Yangon Tyre Factory',
  'Counter to close',
  'Register and local payments',
  'Service bookings',
  'Material receiving',
  'Start with one live workflow.',
  'Send one real workflow, screenshot, spreadsheet, or recurring handoff.',
  'Capture orders from Messenger, Viber, phone, web, or walk-in channels',
  'Four managed products',
  'Working product samples',
  'Choose the system that fits your work.',
  'Open Shop, Plant, Website, or Ecommerce and try the working sample before you contact us.',
  'Need a workspace for your company?',
  'AI may prepare drafts from approved records.',
  'Keep every order and stock movement accountable.',
  'Give the plant floor one operational memory.',
  'Turn a short business brief into a usable website.',
  'Create a Shop-backed storefront and hand customer intent to human review.',
  'Configure Shop',
  'Configure Plant',
]
const encodingCorruption = ['\uFFFD', '\u00e2\u20ac\u201d', '\u00e2\u20ac\u201c', '\u00c2', '\u00f0\u0178']

const pages = new Map(manifest.pages.map((page) => {
  const retained = manifest.customerProducts.find(product => product.id === page.productId && !publicProducts.includes(product))
  return [page.route, { ...page, ...(retained ? {
    title: `${retained.name} | Retained workspace access`,
    description: 'Compatibility access for retained workspaces. Not offered for new-product setup.',
  } : {}), html: readStatic(page.file) }]
}))
const homePage = manifest.pages.find((page) => page.route === '/')
for (const [route, page] of pages) {
  if (!page.html.includes(`<title>${page.title}</title>`)) fail('page_title_drift', { route, expected: page.title })
  for (const token of sharedRequired) {
    if (!page.html.includes(token)) fail('shared_brand_contract_missing', { route, token })
  }
  const footerHref = route === '/shop/' ? '/shop/' : '/'
  const footerLabel = route === '/shop/' ? 'SuperMega Shop, back to top' : 'SuperMega, back to top'
  const footerBrand = `<a class="brand" href="${footerHref}" aria-label="${footerLabel}"><span class="brand-mark" aria-hidden="true">`
  if (!page.html.includes(footerBrand)) fail('shared_footer_brand_missing', { route, footerHref })
  const expectedLogin = route === '/shop/'
    ? `<a href="${appOrigin}/login?product=shop">Login</a>`
    : `<a href="${appOrigin}/login">Login</a>`
  if (countOccurrences(page.html, expectedLogin) !== 1) fail('shared_login_destination_missing', { route, expectedLogin })
  const expectedActive = route === '/shop/' ? 'Shop' : route === '/contact/' ? 'Contact' : null
  const activeLinks = [...page.html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>([^<]+)<\/a>/g)].map(match => match[1])
  if (activeLinks.join(',') !== (expectedActive || '')) fail('shared_navigation_active_state_drift', { route, expectedActive, activeLinks })
  const copyWithoutExternalDestinations = page.html.replace(/\bhref="https?:\/\/[^\"]+"/gi, '')
  for (const token of forbiddenCopy) {
    if (copyWithoutExternalDestinations.toLowerCase().includes(token.toLowerCase())) fail('retired_public_context_present', { route, token })
  }
  for (const marker of encodingCorruption) {
    if (page.html.includes(marker)) fail('public_copy_encoding_corrupt', { route })
  }
  if (route === '/shop/') {
    if (/<section\b[^>]*class="[^"]*\bsubscription-section\b/.test(page.html)) fail('unverified_shop_subscription_section_present', { route })
    if (/\b(?:USD|MMK)\b|\$\s*\d|\d[\d,]*\s*(?:MMK|kyat)/i.test(page.html)) fail('public_price_present', { route })
  } else if (/\b(?:USD|MMK)\b|\$\s*\d|\d[\d,]*\s*(?:MMK|kyat)/i.test(page.html)) fail('public_price_present', { route })
  if (/target\s*=\s*["']?_blank/i.test(page.html) || page.html.includes('window.open(')) fail('new_tab_navigation_present', { route })
  if (page.html.includes('href="/solutions/"') || page.html.includes('href="/trust/"')) fail('retired_public_navigation_present', { route })
  if (!page.html.includes(`<link rel="canonical" href="${new URL(route, `${manifest.release.productionDomain}/`).href}"`)) fail('canonical_url_wrong', { route })
  if (!/<meta name="description" content="[^"]{20,}" \/>/.test(page.html)) fail('page_description_missing', { route })
  if (!page.html.includes(`<meta property="og:title" content="${page.title}" />`)) fail('page_open_graph_title_drift', { route, expected: page.title })
  if (page.description) {
    if (!page.html.includes(`<meta name="description" content="${page.description}" />`)) fail('page_description_drift', { route, expected: page.description })
    if (!page.html.includes(`<meta property="og:description" content="${page.description}" />`)) fail('page_open_graph_description_drift', { route, expected: page.description })
  }
  // Landing pages carry their per-product share card; every other page keeps the generic card.
  const activeLanding = publicProducts.some(product => product.id === page.productId)
  const pageShareImage = new URL(activeLanding ? `/og-card-${page.productId}.png` : '/og-card.png', `${manifest.release.productionDomain}/`).href
  for (const token of [
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="SuperMega" />',
    `<meta property="og:url" content="${new URL(route, `${manifest.release.productionDomain}/`).href}" />`,
    `<meta property="og:image" content="${pageShareImage}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:image" content="${pageShareImage}" />`,
  ]) {
    if (!page.html.includes(token)) fail('page_open_graph_missing', { route, token })
  }
  if (activeLanding && page.html.includes(`content="${new URL('/og-card.png', `${manifest.release.productionDomain}/`).href}"`)) fail('landing_page_generic_share_card_present', { route })
  if (route !== '/' && !page.html.includes('href="/contact/">Contact</a>')) fail('support_footer_contact_missing', { route })
}
const pageTitles = manifest.pages.map((page) => page.title)
if (new Set(pageTitles).size !== pageTitles.length) fail('page_titles_not_unique')

// JSON-LD structured data: the homepage carries one Organization schema and each
// product landing page one Product schema, sourced verbatim from the manifest.
// Every JSON-LD element must keep type="application/ld+json" so it remains an
// HTML data block that browsers never execute.
const jsonLdBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => match[1])
const executableScriptCount = (html) => (html.match(/<script(?![^>]*type="application\/ld\+json")[\s>]/g) || []).length
for (const [route, page] of pages) {
  const expectedExecutable = route === '/contact/' || page.html.includes('data-platform-carousel') ? 2 : 1
  if (executableScriptCount(page.html) !== expectedExecutable) fail('unexpected_executable_script_element', { route, expected: expectedExecutable })
  const blocks = jsonLdBlocks(page.html)
  const landingProduct = publicProducts.find((product) => `/${product.id}/` === route)
  const expectedBlocks = route === '/' || landingProduct ? 1 : 0
  if (blocks.length !== expectedBlocks) fail('structured_data_block_count_wrong', { route, expected: expectedBlocks, actual: blocks.length })
  if (!expectedBlocks) continue
  let schema
  try { schema = JSON.parse(blocks[0]) } catch { fail('structured_data_not_json', { route }) }
  if (schema['@context'] !== 'https://schema.org') fail('structured_data_context_wrong', { route, schema })
  if (Object.keys(schema).sort().join(',') !== '@context,@type,description,name,url') fail('structured_data_field_surface_drift', { route, keys: Object.keys(schema) })
  if (route === '/') {
    if (schema['@type'] !== 'Organization'
      || schema.name !== 'SuperMega'
      || schema.url !== new URL('/', `${manifest.release.productionDomain}/`).href
      || schema.description !== homePage.description) fail('organization_schema_drift', { route, schema })
  } else {
    const pageEntry = manifest.pages.find((entry) => entry.route === route)
    if (schema['@type'] !== 'Product'
      || schema.name !== landingProduct.name
      || schema.url !== new URL(route, `${manifest.release.productionDomain}/`).href
      || schema.description !== (pageEntry.description || landingProduct.description)) fail('product_schema_drift', { route, schema })
  }
}
const publicObservability = readStatic('vercel-insights.js')
for (const token of [
  '["supermega.dev","www.supermega.dev"]',
  '["/","/shop/","/contact/","/privacy/"]',
  "window.va('beforeSend'",
  "window.si('beforeSend'",
  "event.type !== expectedType",
  "url.origin !== location.origin",
  "url.origin + url.pathname",
  "'pageview'",
  "'vital'",
  "'/_vercel/insights/script.js'",
  "'/_vercel/speed-insights/script.js'",
]) {
  if (!publicObservability.includes(token)) fail('public_observability_contract_missing', { token })
}
if (/https?:\/\//i.test(publicObservability)) fail('public_observability_not_same_origin')
if (publicObservability.indexOf("window.va('beforeSend'") > publicObservability.indexOf("'/_vercel/insights/script.js'")) fail('public_analytics_before_send_order_invalid')
if (publicObservability.indexOf("window.si('beforeSend'") > publicObservability.indexOf("'/_vercel/speed-insights/script.js'")) fail('public_speed_before_send_order_invalid')
if (/(?:conversion|contact-form|customer|email|payment|proof_|window\.va\('event')/i.test(publicObservability)) fail('public_observability_private_or_custom_event_surface')

const home = pages.get('/')?.html || ''
const expectedHomeDescription = manifest.company.supporting
if (homePage?.file !== 'index.html') fail('home_manifest_entry_invalid')
const expectedHomeTitle = `SuperMega | ${manifest.company.positioning.replace(/[.]$/, '')}`
if (homePage.title !== expectedHomeTitle) fail('home_manifest_title_drift')
if (homePage.description !== expectedHomeDescription) fail('home_manifest_description_source_drift')
for (const staleToken of [
  '<title>SuperMega | Four products</title>',
  '<meta property="og:title" content="SuperMega | Four products" />',
]) {
  if (home.includes(staleToken)) fail('stale_home_metadata_present', { token: staleToken })
}
if (!hasClassToken(home, 'company-hero')) fail('homepage_contract_missing', { token: 'class token company-hero' })
for (const token of ['class="company-operating-overview"', 'href="/shop/">Explore Shop', 'href="/contact/">Contact</a>', `href="${appOrigin}/login"`]) {
  if (!home.includes(token)) fail('homepage_contract_missing', { token })
}
if (home.includes('>View every screen size') || home.includes('>See Shop on desktop and mobile')) fail('home_action_must_not_be_a_device_tour')
for (const token of ['body[data-view="company"] .company-hero::before{opacity:0;background-image:none}', 'body[data-view="company"] .shop-only-family{grid-template-columns:minmax(0,1fr);max-width:none}', 'body[data-view="company"] .company-hero .hero-grid{grid-template-columns:minmax(0,.76fr) minmax(520px,1.24fr)']) {
  if (!home.includes(token)) fail('home_visual_contract_missing', { token })
}
if (home.includes('body[data-view="company"] .site-header .brand-word { color: var(--text); }')) fail('company_wordmark_light_on_light_override')
if (!home.includes('.company-hero .hero-actions .button-primary') || !home.includes('white-space:nowrap')) fail('company_primary_action_layout_missing')
const shopPageHtml = pages.get('/shop/').html
if (!shopPageHtml.includes('.shop-hero .button-primary') || !shopPageHtml.includes('white-space:nowrap')) fail('shop_primary_action_layout_missing')
if (!home.includes('<p class="hero-kicker">SuperMega · Myanmar</p>')
  || !home.includes('Operating software<br><span>for Myanmar businesses.</span>')
  || !home.includes('SuperMega is a Myanmar software company. Shop is our first customer product for counter sales, stock and order follow-up.')
  || !home.includes('class="company-operating-overview"')
  || home.includes('class="company-product-evidence"')
  || /href="\/(?:website|ecommerce)\//.test(home)
  || /\bSites\b|\bCommerce\b/.test(home)) fail('home_customer_access_scope_missing')
for (const retiredToken of [
  'Four focused products',
  'Pick one product and try the working sample.',
  'Choose one product to try.',
  'Name the business, choose its type, and start with one guided job.',
  'Create a Shop-connected ordering page.',
  'Storefront from real stock',
]) {
  if (home.includes(retiredToken)) fail('superseded_home_offer_copy_present', { token: retiredToken })
}
for (const product of publicProducts) {
  if (home.includes(`href="${product.appRoute}"`)) fail('direct_product_route_remains_primary', { product: product.id })
}
for (const internalLabel of ['SuperMega HQ', 'One next action for the company', 'Owners, evidence, review, and release', 'Gated R&amp;D']) {
  if (home.includes(internalLabel)) fail('internal_system_exposed_on_public_home', { internalLabel })
}
for (const retiredLabel of ['>Open Commerce<', '>Open Production<']) {
  if (home.includes(retiredLabel)) fail('ambiguous_demo_cta_present', { retiredLabel })
}
if (home.includes('Commerce and Production carry real records and actions.')) fail('unsupported_live_record_claim_present')
// The Shop-first home and Shop landings show the full workflow gallery without
// navigation controls; other internal product landings retain their gallery UI.
for (const [route, html] of [['/', home], ['/shop/', pages.get('/shop/').html], ...publicProducts.filter(product => product.id !== 'shop').map(product => [`/${product.id}/`, pages.get(`/${product.id}/`).html])]) {
  const body = html.slice(html.indexOf('<body'))
  const routeProduct = publicProducts.find(product => route === `/${product.id}/`) || null
  const contactActionTarget = routeProduct?.status === 'available-in-app' && route !== '/shop/'
    ? `/contact/?product=${routeProduct.id}`
    : null
  const galleryViews = { shop: 3, website: 2, ecommerce: 2 }
  const expectedLinks = route === '/' ? 9 : route === '/shop/' ? 9 : 5 + Number(Boolean(contactActionTarget))
  if ((body.match(/<a\b/g) || []).length !== expectedLinks) fail('marketing_link_surface_drift', { route, expectedLinks })
  const expectedLogin = route === '/shop/'
    ? `href="${appOrigin}/login?product=shop"`
    : `href="${appOrigin}/login"`
  if (countOccurrences(body, expectedLogin) !== 1) fail('login_action_count_invalid', { route, expectedLogin })
  if (route === '/shop/' && (!body.includes('class="button button-primary" href="/contact/?product=shop">Contact the Shop team') || body.includes('Ask about Shop') || body.includes('Talk about Shop') || body.includes('See Shop screens') || body.includes('Need help with Shop?'))) fail('shop_primary_product_action_missing')
  if (body.includes('>Company</a>')) fail('company_page_navigation_not_consolidated')
  const hasGalleryNavigation = route !== '/shop/' && (galleryViews[routeProduct?.id] || 0) > 1
  const expectedButtons = Number(hasGalleryNavigation) * 2
  if ((body.match(/<button\b/g) || []).length !== expectedButtons) fail('marketing_button_surface_drift', { route, expectedButtons })
  const galleryControlAttributes = [...body.matchAll(/<button\b([^>]*)>/g)]
    .map(match => match[1])
    .filter(attributes => /\bdata-gallery-(?:previous|next)\b/.test(attributes))
  const expectedGalleryButtons = Number(hasGalleryNavigation) * 2
  if (galleryControlAttributes.length !== expectedGalleryButtons) fail('gallery_navigation_button_count_drift', { route, expectedGalleryButtons, actual: galleryControlAttributes.length })
  if (hasGalleryNavigation) {
    const previous = galleryControlAttributes.filter(attributes => /\bdata-gallery-previous\b/.test(attributes))
    const next = galleryControlAttributes.filter(attributes => /\bdata-gallery-next\b/.test(attributes))
    if (previous.length !== 1 || !/aria-label="Previous [^"]+ screen"/.test(previous[0] || '') || !/\bdisabled\b/.test(previous[0] || '')) {
      fail('gallery_previous_control_accessibility_drift', { route })
    }
    if (next.length !== 1 || !/aria-label="Next [^"]+ screen"/.test(next[0] || '') || /\bdisabled\b/.test(next[0] || '')) {
      fail('gallery_next_control_accessibility_drift', { route })
    }
    if (!/data-gallery-status\b[^>]*aria-live="polite"/.test(body) || !hasClassToken(body, 'platform-slides') || !/class="platform-slides"[^>]*tabindex="0"/.test(body)) {
      fail('gallery_status_or_keyboard_accessibility_drift', { route })
    }
  }
  const productVisualMissing = route === '/'
    ? !hasClassToken(body, 'company-hero') || hasClassToken(body, 'product-family') || !body.includes('Operating software<br><span>for Myanmar businesses.</span>') || !body.includes('class="company-operating-overview"') || !body.includes('class="company-product-visual"') || body.includes('class="company-product-evidence"') || body.includes('class="company-portfolio"') || body.includes('data-platform-carousel') || body.includes('Choose a Shop screen') || !body.includes('src="/images/actual-shop-today.png"') || body.includes('data-device-choice')
    : route === '/shop/'
      ? !body.includes('class="shop-hero-app"') || !body.includes('class="shop-actual-showcase"') || !body.includes('Orders and stock. Clear next steps.') || !body.includes('class="shop-responsive-showcase"') || !body.includes('Counter sale on desktop, tablet and phone') || !body.includes('Sample catalog and example prices.') || !body.includes('src="/images/actual-shop-orders.png"') || !body.includes('src="/images/actual-shop-inventory.png"') || countOccurrences(body, 'class="platform-device-capture ') !== 3 || countOccurrences(body, '<article class="shop-workflow-card">') !== 2 || countOccurrences(body, 'src="/images/actual-shop-sell.png"') !== 1 || body.includes('Makro PRO') || body.includes('17 October 2026') || body.includes('class="pos-window"') || body.includes('class="sample-label"') || body.includes('Complete sample sale') || body.includes('shop-sample-demo.js') || body.includes('class="platform-gallery shop-gallery-all"') || body.includes('data-platform-carousel') || body.includes('data-device-choice') || body.includes('data-device-frame') || /<a\b[^>]*>\s*<img\b[^>]*src="\/images\/actual-shop-/i.test(body)
      : !body.includes('class="platform-image"') || !body.includes('class="feature-line"')
  if (productVisualMissing) fail('product_visual_missing', { route })
  if (route === '/') {
    const heroIndex = body.indexOf('class="hero company-hero"')
    const overviewIndex = body.indexOf('class="company-operating-overview"')
    if (heroIndex < 0 || overviewIndex < heroIndex || body.includes('class="company-product-evidence"')) {
      fail('brand_home_story_order_drift')
    }
  }
  const expectedLoginTarget = `${appOrigin}/login${route === '/shop/' ? '?product=shop' : ''}`
  const directAppTargets = [...body.matchAll(/href="(https:\/\/[^\"]+)"/g)]
    .map(match => match[1])
    .filter(target => target.startsWith(`${appOrigin}/`) && target !== expectedLoginTarget)
  if (directAppTargets.length !== 0) fail('product_action_release_state_drift', { route, expected: 0, actual: directAppTargets.length })
  if (contactActionTarget && !body.includes(`href="${contactActionTarget}">Contact SuperMega</a>`)) fail('product_action_destination_drift', { route, expected: contactActionTarget })
  for (const token of ['Request assisted setup', 'Open Ecommerce', 'Open Website', 'Choose shop type', 'theme-toggle', 'Start guided trial']) {
    if (body.includes(token)) fail('retired_acquisition_surface', { route, token })
  }
  const legacyActionLabels = new Set(['Open Shop', 'Open Ecommerce', 'Open Website', 'Profit Control'])
  for (const match of body.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
    const label = match[1].replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '').trim()
    if (legacyActionLabels.has(label)) fail('retired_acquisition_action', { route, label })
  }
}
if (countOccurrences(home, 'href="/shop/">Explore Shop') !== 1 || home.includes('class="family-link"')) fail('brand_home_primary_shop_link_invalid')

const shopPage = pages.get('/shop/')?.html || ''
for (const [desktop, mobile, tablet] of [
  ['actual-shop-sell.png', 'actual-shop-sell-mobile.png', 'actual-shop-sell-tablet.png'],
]) {
  if (!shopPage.includes(`src="/images/${desktop}"`)
    || !shopPage.includes(`src="/images/${tablet}"`)
    || !shopPage.includes(`src="/images/${mobile}"`)
    || !hasClassToken(shopPage, 'platform-device-capture-desktop')
    || !hasClassToken(shopPage, 'platform-device-capture-tablet')
    || !hasClassToken(shopPage, 'platform-device-capture-phone')) {
    fail('shop_device_capture_set_missing', { desktop, mobile })
  }
}
for (const [route, html] of [['/', home], ['/shop/', shopPage]]) {
  if (!html.includes('<html lang="en">')) fail('marketing_page_not_english', { route })
  if (html.includes('data-language-toggle') || html.includes('src="/site-language.js"')) fail('marketing_language_control_present', { route })
  if (html.includes('data-i18n=') || /[\u1000-\u109f]/u.test(html)) fail('marketing_myanmar_copy_present', { route })
}
for (const token of ['Sell at the counter.', 'Stay ahead of stock.', 'Orders and stock. Clear next steps.', 'Sample catalog and example prices.', 'Search or scan products, record a sale, and follow open orders and stock in one workspace.']) {
  if (!shopPage.includes(token)) fail('shop_page_scope_missing', { token })
}
if (/<section\b[^>]*class="[^"]*\bsubscription-section\b/.test(shopPage)
  || /no setup fee|printer-sourcing markup|Shop is subscription-only/i.test(shopPage)) fail('unverified_shop_offer_copy_present')
if (publicProducts.map(product => product.id).join(',') !== 'shop') fail('shop_customer_access_scope_missing')

const contact = pages.get('/contact/')?.html || ''
const contactMain = contact.match(/<main\b[\s\S]*?<\/main>/)?.[0] || ''
for (const token of [
  'data-contact-form', 'action="/api/contact-submissions"', 'name="name"', 'name="email"',
  'name="company"', 'name="product"', 'value="guide"', 'name="template"', 'name="goal"',
  'name="idempotency_key"', 'name="proof_contract"', 'name="proof_digest"', 'class="contact-honeypot"',
  'x-idempotency-key', 'Email',
  'placeholder="Tell us what your business needs."', 'Company (optional)', '>Send message</button>',
  'Message received:', 'Keep this reference if you need to follow up.',
  "shop:'Shop'", "website:'Sites'", "ecommerce:'Commerce'",
]) {
  if (!contact.includes(token)) fail('contact_contract_missing', { token })
}
for (const token of [
  '<select name="product"', 'Choose a service', 'What would you like us to prepare?', 'What to include',
  'Attached request details', 'Readiness', 'Sources', 'Behavior', 'Decisions', 'Reply email',
]) {
  if (contactMain.includes(token)) fail('retired_contact_ui_present', { token })
}
for (const token of ['Request managed company intelligence.', "submit.textContent='Request managed pilot'", 'managedIntelligenceRequest']) {
  if (contact.includes(token)) fail('retired_managed_pilot_pitch_present', { token })
}
if (contact.includes('mailto:') || contact.includes('tel:') || contact.includes('Email swanhtet@supermega.dev')) fail('contact_bypass_links_returned')
if (!contact.includes('source.value=location.href')) fail('contact_source_attribution_missing')

if (/<(?:input|textarea)\b(?=[^>]*\bname="(?:name|email|company|template|goal)")(?=[^>]*\bvalue=)[^>]*>/i.test(contact)
  || /<textarea\b(?=[^>]*\bname="goal")[^>]*>\s*[^<\s]/i.test(contact)) fail('contact_user_field_prefilled')
if (contact.includes('value="agents"') || contact.includes('>AI Agent Solutions<')) fail('shared_capability_listed_as_contact_product')
if (/<[^>]+\sstyle=/.test(contact)) fail('contact_inline_style_returned')

const privacy = pages.get('/privacy/')?.html || ''
for (const token of ['Contact requests', 'Product data', 'AI processing', 'Deletion', 'optional attached request summary, outcome status, and digest', 'digest-bound aggregate outcome', 'excludes raw product records, questions, approval contents, and account details']) {
  if (!privacy.includes(token)) fail('privacy_contract_missing', { token })
}

const favicon = readStatic('favicon.svg')
const faviconAccent = manifest.brand.colors.accent
for (const token of ['SuperMega terminal mark', 'd="M10 9 26 22 10 35M35 35h27"', `stroke="${faviconAccent}"`, 'stroke-width="6"', 'shape-rendering="geometricPrecision"']) {
  if (!favicon.includes(token)) fail('brand_mark_contract_missing', { token })
}
if (/<rect\b/i.test(favicon)) fail('brand_mark_background_present')

for (const cardFile of ['og-card.png', ...publicProducts.map((product) => `og-card-${product.id}.png`)]) {
  const ogCardPath = resolve(staticDir, cardFile)
  requireFile(ogCardPath, cardFile)
  const ogCard = readFileSync(ogCardPath)
  if (!ogCard.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) fail('og_card_not_png', { cardFile })
  if (ogCard.readUInt32BE(16) !== 1200 || ogCard.readUInt32BE(20) !== 630) fail('og_card_dimensions_wrong', { cardFile, width: ogCard.readUInt32BE(16), height: ogCard.readUInt32BE(20) })
}

for (const [key, value] of Object.entries({
  service: 'supermega-public-site',
  brandVersion: manifest.brand.version,
  contextVersion: manifest.contextVersion,
  catalogVersion: manifest.catalogVersion,
})) {
  if (release[key] !== value) fail('release_metadata_drift', { key, expected: value, actual: release[key] })
}
if (!/^(?:[0-9a-f]{40}|preview-[a-z0-9-]{8,64}|unknown)$/.test(release.commit)) fail('release_commit_invalid', { commit: release.commit })
if (!/^\d{4}-\d{2}-\d{2}T/.test(release.generatedAt)) fail('release_timestamp_invalid')
const publicGalleryEvidence = release.publicGalleryEvidence
const publicGalleryFiles = [
  'actual-shop-today.png',
  'actual-shop-sell.png', 'actual-shop-sell-tablet.png', 'actual-shop-sell-mobile.png',
  'actual-shop-orders.png', 'actual-shop-orders-tablet.png', 'actual-shop-orders-mobile.png',
  'actual-shop-inventory.png', 'actual-shop-inventory-tablet.png', 'actual-shop-inventory-mobile.png',
]
const sourceGalleryByFile = new Map(publicGalleryProvenance.assets?.map(asset => [asset.file, asset]) ?? [])
const expectedPublicGalleryEvidence = {
  schemaVersion: publicGalleryProvenance.schemaVersion,
  status: publicGalleryProvenance.status,
  records: publicGalleryProvenance.records,
  captureSourceCommit: publicGalleryProvenance.captureSourceCommit,
  captureSourceTree: publicGalleryProvenance.captureSourceTree,
  capturedAt: publicGalleryProvenance.capturedAt,
  assets: publicGalleryFiles.map(file => sourceGalleryByFile.get(file)),
}
if (publicGalleryEvidence?.schemaVersion !== 'supermega.public-gallery-provenance.v1'
  || publicGalleryEvidence.status !== 'local_component_capture'
  || publicGalleryEvidence.records !== 'synthetic'
  || !/^[0-9a-f]{40}$/.test(publicGalleryEvidence.captureSourceCommit)
  || !/^[0-9a-f]{40}$/.test(publicGalleryEvidence.captureSourceTree)
  || typeof publicGalleryEvidence.capturedAt !== 'string'
  || !Number.isFinite(Date.parse(publicGalleryEvidence.capturedAt))
  || new Date(publicGalleryEvidence.capturedAt).toISOString() !== publicGalleryEvidence.capturedAt
  || publicGalleryEvidence.assets?.map((asset) => asset.file).join(',') !== publicGalleryFiles.join(',')
  || expectedPublicGalleryEvidence.assets.some(asset => asset === undefined)
  || JSON.stringify(publicGalleryEvidence) !== JSON.stringify(expectedPublicGalleryEvidence)) {
  fail('public_gallery_provenance_drift')
}
for (const asset of publicGalleryEvidence.assets) {
  const path = resolve(staticDir, 'images', asset.file)
  requireFile(path, `images/${asset.file}`)
  const bytes = readFileSync(path)
  const actualSha256 = createHash('sha256').update(bytes).digest('hex')
  if (!/^[0-9a-f]{64}$/.test(asset.sha256) || actualSha256 !== asset.sha256
    || !bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    || bytes.readUInt32BE(16) !== asset.width || bytes.readUInt32BE(20) !== asset.height) {
    fail('public_gallery_asset_mismatch', { file: asset.file })
  }
}

const sitemap = readStatic('sitemap.xml')
for (const page of manifest.pages) {
  const canonical = new URL(page.route, `${manifest.release.productionDomain}/`).href
  if (!discoverablePages.includes(page)) {
    if (sitemap.includes(`<loc>${canonical}</loc>`)) fail('retained_product_in_sitemap', { route: page.route })
    const retained = readStatic(page.file)
    if (!retained.includes('name="robots" content="noindex,follow"') || !retained.includes('not offered for new setup') || retained.includes('class="trade-card')) fail('retained_product_boundary_missing', { route: page.route })
    continue
  }
  if (!sitemap.includes(`<loc>${canonical}</loc>`)) fail('sitemap_route_missing', { route: page.route })
}

const functionNames = readdirSync(functionsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
const expectedFunctionNames = ['contact-submissions.js.func', 'health.js.func', 'not-found.js.func']
if (functionNames.join(',') !== expectedFunctionNames.join(',')) fail('public_function_set_drift', { expectedFunctionNames, functionNames })
for (const name of expectedFunctionNames) {
  const functionDir = resolve(functionsDir, name)
  requireFile(resolve(functionDir, 'index.js'), `${name}/index.js`)
  const functionConfig = JSON.parse(readFileSync(resolve(functionDir, '.vc-config.json'), 'utf8'))
  if (functionConfig.handler !== 'index.js' || functionConfig.runtime !== 'nodejs24.x') fail('function_runtime_drift', { name, functionConfig })
}
const contactFunction = readFileSync(resolve(functionsDir, 'contact-submissions.js.func', 'index.js'), 'utf8')
for (const token of ['supermega_leads', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'TELEGRAM_BOT_TOKEN', 'SUPERMEGA_LEAD_WEBHOOK_URL', 'SUPERMEGA_CONTACT_IDEMPOTENCY_SECRET', 'required_fields_missing', 'product_not_supported', 'idempotency_key_required', 'idempotency_conflict', 'rate_limited', 'supermega.managed_trial_proof.v2', 'proof_outcome', 'proof_outcome_digest', 'proof_outcome_accepted', 'trial_proof_invalid', 'client_provided_summary', 'CONTACT_FINGERPRINT_CURRENT_VERSION', 'proof_bound', 'privacyUrl', 'resolution=ignore-duplicates,return=representation', "'idempotency-key'"]) {
  if (!contactFunction.includes(token)) fail('contact_runtime_contract_missing', { token })
}
if (/\bvision\b/i.test(contactFunction)) fail('retired_product_present_in_contact_runtime')
if (/require\(['"]pg['"]\)|DATABASE_URL|postgres/i.test(contactFunction)) fail('public_contact_has_direct_postgres_access')

const config = JSON.parse(readFileSync(configPath, 'utf8'))
if (config.version !== 3 || !Array.isArray(config.routes)) fail('vercel_config_shape_invalid')
if (config.crons) fail('public_artifact_must_not_define_crons')
const securityRoute = config.routes.find((entry) => entry.src === '^/(.*)$' && entry.continue === true && entry.headers?.['content-security-policy'])
if (!securityRoute) fail('public_security_header_route_missing')
const csp = securityRoute.headers['content-security-policy']
const scriptBody = contact.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''
const styleBodies = [contact, home].flatMap((page) => [...page.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1]))
const expectedStyleHashes = [...new Set(styleBodies.map((styleBody) => `'sha256-${createHash('sha256').update(styleBody).digest('base64')}'`))]
const expectedScriptHash = `'sha256-${createHash('sha256').update(scriptBody).digest('base64')}'`
for (const token of ["default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'", "script-src-attr 'none'", "style-src-attr 'none'", expectedScriptHash]) {
  if (!csp.includes(token)) fail('public_csp_contract_missing', { token })
}
for (const token of expectedStyleHashes) {
  if (!csp.includes(token)) fail('public_csp_style_hash_missing', { token })
}
if (csp.includes("'unsafe-inline'") || csp.includes("'unsafe-eval'")) fail('public_csp_unsafe_policy')
for (const [name, value] of Object.entries({ 'cross-origin-opener-policy': 'same-origin', 'cross-origin-resource-policy': 'same-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' })) {
  if (securityRoute.headers[name] !== value) fail('public_security_header_missing', { name, expected: value, actual: securityRoute.headers[name] })
}
for (const redirect of manifest.redirects) {
  const route = config.routes.find((entry) => entry.src === redirect.source)
  const retained = manifest.customerProducts.find(product => product.publicAnchor === redirect.destination && !publicProducts.includes(product))
  const destination = retained ? `/${retained.id}/` : redirect.destination
  if (route?.status !== 308 || route?.headers?.Location !== destination) fail('retired_route_redirect_missing', { redirect, actual: route })
}
for (const route of [
  ['^/api/contact-submissions/status/?$', '/api/contact-submissions.js'],
  ['^/api/contact-submissions/?$', '/api/contact-submissions.js'],
  ['^/api/health/?$', '/api/health.js'],
]) {
  if (!config.routes.some((entry) => entry.src === route[0] && entry.dest === route[1])) fail('public_api_route_missing', { route })
}
if (!config.routes.some((entry) => entry.src === '^/vercel-insights\\.js$' && entry.continue === true && entry.headers?.['cache-control'] === 'no-store, max-age=0')) fail('public_observability_no_store_route_missing')
if (!config.routes.some((entry) => entry.src === '^/(?:favicon\\.svg|site\\.webmanifest|og-card(?:-shop)?\\.png)$' && entry.continue === true && entry.headers?.['cache-control'])) fail('static_asset_cache_route_missing')
const filesystemRouteIndex = config.routes.findIndex((entry) => entry.handle === 'filesystem')
if (filesystemRouteIndex < 0) fail('filesystem_route_missing')
const firstPublicRouteMatch = (path) => {
  const index = config.routes.findIndex((entry) => typeof entry.src === 'string' && entry.continue !== true && new RegExp(entry.src).test(path))
  return index < 0 ? undefined : { entry: config.routes[index], index }
}
for (const productId of manifest.productVisibility.retainedOnlyProductIds) {
  for (const path of [`/${productId}`, `/${productId}/`, `/${productId}/index.html`, `/${productId}/settings/nested`]) {
    const match = firstPublicRouteMatch(path)
    if (!match || match.index >= filesystemRouteIndex || match.entry.status !== 404 || match.entry.dest !== '/404.html') {
      fail('internal_product_route_not_private', { productId, path, match, filesystemRouteIndex })
    }
  }
  if (existsSync(resolve(staticDir, `og-card-${productId}.png`))) fail('internal_product_share_card_public', { productId })
}
if (!config.routes.some((entry) => entry.src === '^/(.*)$' && entry.status === 404 && entry.dest === '/404.html')) fail('not_found_route_missing')

// Retired public API surface. The legacy ops endpoints were deliberately removed
// in the public-site consolidation (f8c5299e); their old ops-key 401 contract is
// retired with them. Every unknown /api/* path must resolve to the not-found
// function, which answers 404 {"status":"not_found"} with no auth semantics.
const apiFallthrough = config.routes.find((entry) => entry.src === '^/api/(.*)$')
if (apiFallthrough?.dest !== '/api/not-found.js') fail('retired_api_fallthrough_route_missing', { apiFallthrough })
const firstApiMatch = (path) => config.routes.find((entry) => typeof entry.src === 'string' && entry.continue !== true && new RegExp(entry.src).test(path))
const retiredApiPaths = [
  '/api/pipeline-control/status',
  '/api/pipeline-control',
  '/api/commercial-control/status',
  '/api/commercial-control',
  '/api/checkout-start',
  '/api/product-activation',
  '/api/sales-daily',
  '/api/behavior-events',
  '/api/campaign-clicks',
  '/api/public-app-handoff',
]
for (const path of retiredApiPaths) {
  const match = firstApiMatch(path)
  if (match?.dest !== '/api/not-found.js') fail('retired_api_path_not_retired', { path, match })
}
for (const path of ['/api/health', '/api/contact-submissions', '/api/contact-submissions/status']) {
  const match = firstApiMatch(path)
  if (match?.dest === '/api/not-found.js' || !match?.dest) fail('active_api_path_retired', { path, match })
}
const notFoundFunction = readFileSync(resolve(functionsDir, 'not-found.js.func', 'index.js'), 'utf8')
if (!notFoundFunction.includes('res.statusCode = 404')
  || !notFoundFunction.includes("JSON.stringify({ status: 'not_found' })")) fail('retired_api_not_found_contract_drift')
if (/\b401\b|unauthorized|SUPERMEGA_OPS_KEY|authorization|x-ops-key/i.test(notFoundFunction)) fail('retired_api_function_carries_auth_semantics')

console.log(JSON.stringify({
  ok: true,
  contract: 'supermega_public_output',
  pages: [...pages.keys()],
  functions: functionNames,
  staticFiles: actualStaticFiles.length,
  release,
}, null, 2))

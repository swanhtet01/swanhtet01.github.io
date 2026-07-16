import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)

const root = process.cwd()
const outputDir = resolve(root, '.vercel', 'output')
const staticDir = resolve(outputDir, 'static')
const functionsDir = resolve(outputDir, 'functions', 'api')

function fail(message, extra = {}) {
  console.error(JSON.stringify({ status: 'error', message, ...extra }, null, 2))
  process.exit(1)
}

function readText(relativePath) {
  const target = resolve(staticDir, relativePath)
  if (!existsSync(target)) fail('missing_public_page', { relativePath })
  return readFileSync(target, 'utf8')
}

function findRoute(routes, src) {
  return routes.find((route) => route.src === src)
}

if (!existsSync(outputDir) || !existsSync(staticDir) || !existsSync(functionsDir)) {
  fail('public_output_missing')
}

const configPath = resolve(outputDir, 'config.json')
if (!existsSync(configPath)) fail('missing_public_config')
const config = JSON.parse(readFileSync(configPath, 'utf8'))
const routes = Array.isArray(config.routes) ? config.routes : []

const expectedStaticEntries = new Set(['404.html', 'contact', 'favicon.svg', 'index.html', 'live-plant-mobile.png', 'live-plant-workspace.png', 'live-shop-mobile.png', 'live-shop-workspace.png', 'privacy', 'robots.txt', 'site.webmanifest', 'sitemap.xml', 'sw.js', 'work'])
const actualStaticEntries = readdirSync(staticDir)
for (const entry of actualStaticEntries) {
  if (!expectedStaticEntries.has(entry)) fail('retired_public_static_entry_present', { entry })
}
for (const entry of expectedStaticEntries) {
  if (!actualStaticEntries.includes(entry)) fail('required_public_static_entry_missing', { entry })
}
for (const entry of ['live-shop-workspace.png', 'live-plant-workspace.png']) {
  const image = readFileSync(resolve(staticDir, entry))
  const width = image.length >= 24 ? image.readUInt32BE(16) : 0
  const height = image.length >= 24 ? image.readUInt32BE(20) : 0
  if (width !== 1600 || height !== 480) fail('public_workspace_capture_has_wrong_geometry', { entry, width, height })
}
for (const entry of ['live-shop-mobile.png', 'live-plant-mobile.png']) {
  const image = readFileSync(resolve(staticDir, entry))
  const width = image.length >= 24 ? image.readUInt32BE(16) : 0
  const height = image.length >= 24 ? image.readUInt32BE(20) : 0
  if (width !== 360 || height !== 732) fail('public_mobile_capture_has_wrong_geometry', { entry, width, height })
}
const approvedCaptureHashes = new Map([
  ['live-shop-workspace.png', '4a2870c9a73790f5a80c813ccba106122b002438597d9d9b0192c5bf6002212a'],
  ['live-shop-mobile.png', 'eb4bd32150810edb0a4dd047209b663aac9c0abec7a91b308fbb368b5f479ead'],
  ['live-plant-workspace.png', '9ab75ecf4956ce2b5a2cee21e9e6cf90c78911f5ef25d4860c7ec3181e45e335'],
  ['live-plant-mobile.png', '744d9dbe3e581a14032ea92f7c68e1d6582370f9792ac6ebd4182cd37357508a'],
])
for (const [entry, approvedHash] of approvedCaptureHashes) {
  const actualHash = createHash('sha256').update(readFileSync(resolve(staticDir, entry))).digest('hex')
  if (actualHash !== approvedHash) fail('public_capture_not_reviewed', { entry, approvedHash, actualHash })
}

const expectedFunctions = new Set(['contact-submissions.js.func', 'health.js.func', 'not-found.js.func'])
const actualFunctions = readdirSync(functionsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
for (const entry of actualFunctions) {
  if (!expectedFunctions.has(entry)) fail('retired_public_function_present', { entry })
}
for (const entry of expectedFunctions) {
  if (!actualFunctions.includes(entry)) fail('required_public_function_missing', { entry })
}

const publicDatastoreShim = resolve(functionsDir, 'contact-submissions.js.func', 'api', 'lib', 'supermega-datastore.js')
if (!existsSync(publicDatastoreShim) || !readFileSync(publicDatastoreShim, 'utf8').includes('public_direct_postgres_disabled')) {
  fail('public_contact_runtime_shim_missing')
}

const publicBlobQueueBundle = resolve(functionsDir, 'contact-submissions.js.func', 'api', 'lib', 'supermega-blob-queue.js')
if (!existsSync(publicBlobQueueBundle)) fail('public_contact_blob_queue_bundle_missing')
const blobQueue = require(publicBlobQueueBundle)
if (blobQueue.queueStatus().sdk !== 'available') fail('public_contact_blob_sdk_not_bundled')
const previousBlobToken = process.env.BLOB_READ_WRITE_TOKEN
const blobWrites = []
try {
  process.env.BLOB_READ_WRITE_TOKEN = 'public-artifact-contract-token'
  const blobSave = await blobQueue.savePipelineAction({
    action_id: 'TASK-PUBLIC-ARTIFACT-CONTRACT',
    lead_id: 'LEAD-PUBLIC-ARTIFACT-CONTRACT',
    title: 'Public artifact contract',
  }, {
    blobSdk: {
      put: async (pathname, body, options) => {
        blobWrites.push({ pathname, body: JSON.parse(body), options })
        return { pathname }
      },
    },
  })
  if (blobSave.status !== 'ready' || blobSave.adapter !== 'vercel_blob') fail('public_contact_blob_fallback_not_runnable')
  if (blobWrites.length !== 1 || blobWrites[0].options.access !== 'private' || blobWrites[0].options.allowOverwrite !== true) {
    fail('public_contact_blob_fallback_not_private')
  }
} finally {
  if (previousBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN
  else process.env.BLOB_READ_WRITE_TOKEN = previousBlobToken
}

const home = readText('index.html')
const work = readText('work/index.html')
const contact = readText('contact/index.html')
const privacy = readText('privacy/index.html')
const notFound = readText('404.html')
const pages = new Map([
  ['index.html', home],
  ['work/index.html', work],
  ['contact/index.html', contact],
  ['privacy/index.html', privacy],
  ['404.html', notFound],
])
const shopStartHref = 'https://app.supermega.dev/?demo=shop&amp;returnTo=%2Fstart'
const plantStartHref = 'https://app.supermega.dev/?demo=plant&amp;returnTo=%2Fstart'

const retiredCatalogContent = [
  '>Products<',
  '>Pricing<',
  '>AI workers<',
  'File Analyst',
  'Payment Reconciler',
  'Data Cleanup &amp; Reporting Agent',
  'data-clean-report-agent',
  'supermega-machine.vercel.app/workcell',
  'href="/reconcile/"',
  '/site/shots/',
  'supermega-portal-card.png',
  'WorkDesk',
  'AgentOps',
  'Source-to-Screen',
  'AI Workcell',
  'live-shop-dashboard.png',
  '<h1 id="supermega-heading">SuperMega</h1>',
  '/icon.svg',
  'M-rune',
  '>SM<',
]

for (const [relativePath, html] of pages) {
  for (const required of ['data-theme="light"', 'data-theme="dark"', 'prefers-color-scheme', 'prefers-reduced-motion', 'data-theme-toggle']) {
    if (!html.includes(required)) fail('public_page_missing_theme_contract', { relativePath, required })
  }
  for (const required of ['class="terminal-mark"', '<img src="/favicon.svg" alt="" width="64" height="64" />', 'backdrop-filter: blur(24px)', 'supermega<span class="domain">.dev</span>']) {
    if (!html.includes(required)) fail('public_page_missing_terminal_brand_contract', { relativePath, required })
  }
  for (const required of [shopStartHref, plantStartHref]) {
    if (!html.includes(required)) fail('public_page_missing_guided_start', { relativePath, required })
  }
  for (const forbidden of ['href="https://app.supermega.dev/?demo=shop"', 'href="https://app.supermega.dev/?demo=plant"']) {
    if (html.includes(forbidden)) fail('public_page_contains_unguided_workspace_entry', { relativePath, forbidden })
  }
  for (const forbidden of [...retiredCatalogContent, 'target="_blank"', 'target=_blank', 'window.open(']) {
    if (html.includes(forbidden)) fail('public_page_contains_retired_catalog_content', { relativePath, forbidden })
  }
}

for (const required of [
  '<title>supermega.dev | Run the shop. See the plant.</title>',
  '<h1 id="portfolio-heading">Run the shop. See the plant. Fix the gaps.</h1>',
  'href="/work/"',
  shopStartHref,
  plantStartHref,
  "href:'https://app.supermega.dev/?demo=shop&returnTo=%2Fstart'",
  "href:'https://app.supermega.dev/?demo=plant&returnTo=%2Fstart'",
  'operational software / live',
  'class="hero-lead">One place to run the day.</strong>',
  '<h2 id="workspaces-heading">No software maze.</h2>',
  'Two working systems',
  'AI helps draft, check, and surface next steps while approvals stay tied to the work behind them.',
  '<strong>Shop</strong>',
  '<strong>Plant</strong>',
  '<h2 id="brief-heading">Show us the broken handoff.</h2>',
  '>Start with one workflow</a>',
  'data-product-preview',
  'data-preview-open',
  'data-product-preview-button="shop"',
  'data-product-preview-button="plant"',
  'src="/live-shop-workspace.png"',
  'Current Shop workspace showing priority checks, sales, cash, customers, and stock',
  "src:'/live-plant-workspace.png'",
  'srcset="/live-shop-mobile.png"',
  "mobileSrc:'/live-plant-mobile.png'",
  'data-public-status',
  "fetch('/api/health'",
  'Sales, stock, customers, receivables, purchasing, and daily close in one operating flow.',
  'Production plans, machine state, maintenance, quality, and handoff history in one floor view.',
  'site.webmanifest',
]) {
  if (!home.includes(required)) fail('homepage_front_door_contract_missing', { required })
}

for (const required of [
  '<title>Work | supermega.dev</title>',
  '<h1 id="work-heading">See the work before the pitch.</h1>',
  'Current Shop and Plant screens',
  'No account to try',
  'Desktop, tablet, and mobile',
  '<h2 id="shop-case-heading">Keep the day together.</h2>',
  '<h2 id="plant-case-heading">Give the floor a memory.</h2>',
  'class="case-actions"',
  'href="/contact/?from=shop-workspace"',
  'href="/contact/?from=plant-workspace"',
  'aria-label="Request a private Shop workspace"',
  'aria-label="Request a private Plant workspace"',
  'aria-label="Try a Shop workflow"',
  'aria-label="Try a Plant workflow"',
  'https://app.supermega.dev/?demo=shop&amp;returnTo=%2Fsales',
  'https://app.supermega.dev/?demo=shop&amp;returnTo=%2Fbooks%3Ftab%3Dreorder',
  'https://app.supermega.dev/?demo=shop&amp;returnTo=%2Fsales%3Fview%3Dclose',
  'https://app.supermega.dev/?demo=plant&amp;returnTo=%2Ffactory',
  'https://app.supermega.dev/?demo=plant&amp;returnTo=%2Fplan',
  'https://app.supermega.dev/?demo=plant&amp;returnTo=%2Fhandoff',
  '.case-toolbar .btn { min-height: 44px; }',
  'src="/live-shop-workspace.png"',
  'Current Shop workspace showing priority checks, sales, cash, customers, and stock',
  'src="/live-plant-workspace.png"',
  'Current Plant workspace showing production plan navigation and machine state across two lines',
  'srcset="/live-shop-mobile.png"',
  'srcset="/live-plant-mobile.png"',
  '<h2 id="work-close-heading">One useful workflow is enough to start.</h2>',
  '>Describe the workflow</a>',
]) {
  if (!work.includes(required)) fail('work_page_contract_missing', { required })
}

for (const forbidden of ['https://demo.supermega.dev/', 'The intelligent workspace for daily operations.', 'Explore live demos', 'Open workspace', 'rotate(', 'data-hero-media', 'Current build', 'Build an agent solution', '>Agent solution<', 'Need a repeated task handled?', 'id="products"', 'Run the operation. See what matters.', 'Open a workspace.', 'Try first. Add data later.', 'Need something different?', 'Operational software, built to fit.', 'Less chasing. More running.', '[data-reveal] { opacity: 0']) {
  if (home.includes(forbidden)) fail('homepage_keeps_superseded_portfolio_copy', { forbidden })
}

for (const required of ['<h1 data-contact-heading>What should run better?</h1>', 'action="/api/contact-submissions"', 'name="name"', 'name="email"', 'name="company"', 'name="goal"', 'No account or data connection is made before you approve it.']) {
  if (!contact.includes(required)) fail('contact_surface_contract_missing', { required })
}
for (const forbidden of ['placeholder="Drive folder', 'placeholder="Example:', 'Upload files', 'Source link or system', 'custom AI worker', 'name="workflow"', 'name="first_output"', 'name="requested_package"', 'name="product_area"', 'General enquiry']) {
  if (contact.includes(forbidden)) fail('contact_surface_keeps_retired_intake', { forbidden })
}

for (const required of ['Only the details needed to reply.', 'Sending a contact request does not create an account or connect any data source.']) {
  if (!privacy.includes(required)) fail('privacy_surface_contract_missing', { required })
}

const favicon = readText('favicon.svg')
for (const required of ['supermega.dev terminal mark', '#6b95ff', '#3dd6a2']) {
  if (!favicon.includes(required)) fail('terminal_favicon_contract_invalid', { required })
}

const manifest = JSON.parse(readText('site.webmanifest'))
if (manifest.name !== 'supermega.dev' || manifest.short_name !== 'supermega' || manifest.start_url !== '/' || manifest.icons?.[0]?.src !== '/favicon.svg') {
  fail('webmanifest_contract_invalid', { manifest })
}

const sitemap = readText('sitemap.xml')
for (const required of ['https://supermega.dev/', 'https://supermega.dev/work/', 'https://supermega.dev/contact/', 'https://supermega.dev/privacy/']) {
  if (!sitemap.includes(required)) fail('sitemap_missing_current_page', { required })
}
for (const forbidden of ['/products/', '/pricing/', '/reconcile/', '/ai-agents/', '/agent-templates/', '/offers/']) {
  if (sitemap.includes(forbidden)) fail('sitemap_keeps_retired_catalog_route', { forbidden })
}

for (const [src, dest] of [
  ['^/api/contact-submissions$', '/api/contact-submissions.js'],
  ['^/api/contact-submissions/status$', '/api/contact-submissions.js'],
  ['^/api/health$', '/api/health.js'],
  ['^/api/(.*)$', '/api/not-found.js'],
]) {
  const route = findRoute(routes, src)
  if (route?.dest !== dest) fail('public_api_route_missing', { src, expected: dest, actual: route })
}

const appRoute = findRoute(routes, '^/(?:login|app|clients)(?:/.*)?$')
if (appRoute?.status !== 308 || appRoute?.headers?.Location !== 'https://app.supermega.dev/') {
  fail('app_handoff_route_invalid', { actual: appRoute })
}
const demoRoute = findRoute(routes, '^/demo/?$')
if (demoRoute?.status !== 308 || demoRoute?.headers?.Location !== 'https://demo.supermega.dev/') {
  fail('demo_handoff_route_invalid', { actual: demoRoute })
}
const reconcileRoute = findRoute(routes, '^/reconcile(?:/.*)?$')
if (reconcileRoute?.status !== 308 || reconcileRoute?.headers?.Location !== '/contact/?from=workflow') {
  fail('retired_reconcile_route_invalid', { actual: reconcileRoute })
}
const catalogRoute = findRoute(routes, '^/(?:products|product|offers|pricing|plans|packages|agent-templates|ai-agents|workcell|operator|machine|card|megaos-preview|free)(?:/.*)?$')
if (catalogRoute?.status !== 308 || catalogRoute?.headers?.Location !== '/') {
  fail('retired_catalog_route_invalid', { actual: catalogRoute })
}
if ((config.crons || []).length !== 0) fail('retired_public_cron_present', { crons: config.crons })

const catalogRouteIndex = routes.indexOf(catalogRoute)
const filesystemRouteIndex = routes.findIndex((route) => route.handle === 'filesystem')
if (catalogRouteIndex < 0 || filesystemRouteIndex < 0 || catalogRouteIndex > filesystemRouteIndex) {
  fail('catalog_route_must_precede_filesystem', { catalogRouteIndex, filesystemRouteIndex })
}

console.log(JSON.stringify({ status: 'ok', contract: 'supermega_public_front_door', pages_checked: pages.size, functions_checked: actualFunctions.length }))

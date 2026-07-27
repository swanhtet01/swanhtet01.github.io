import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = process.cwd()
const staticDir = resolve(root, '.vercel', 'output', 'static')
const functionsDir = resolve(root, '.vercel', 'output', 'functions', 'api')
const configPath = resolve(root, '.vercel', 'output', 'config.json')
const manifest = JSON.parse(readFileSync(resolve(root, 'site-manifest.json'), 'utf8'))

function fail(code, detail = {}) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_public_output', code, ...detail }, null, 2))
  process.exit(1)
}

function requireFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) fail('required_file_missing', { label, path })
}

function readStatic(path) {
  const fullPath = resolve(staticDir, path)
  requireFile(fullPath, path)
  return readFileSync(fullPath, 'utf8')
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
if (manifest.customerProducts?.map((product) => `${product.id}:${product.runtimeId}:${product.name}`).join(',') !== 'shop:commerce:Shop,plant:production:Plant,website:website:Website,ecommerce:ecommerce:Ecommerce') fail('customer_product_portfolio_drift')
if (manifest.customerProducts?.map((product) => product.appRoute).join(',') !== 'https://app.supermega.dev/shop/?tab=counter,https://app.supermega.dev/plant/?tab=production,https://app.supermega.dev/website/,https://app.supermega.dev/ecommerce/') fail('customer_product_routes_drift')
const operatingProducts = manifest.customerProducts?.filter((product) => product.kind === 'operating-product') || []
const makerProducts = manifest.customerProducts?.filter((product) => product.kind === 'maker-product') || []
if (operatingProducts.map((product) => product.id).join(',') !== 'shop,plant') fail('operating_product_portfolio_drift')
if (makerProducts.map((product) => `${product.id}:${product.status}`).join(',') !== 'website:available-in-app,ecommerce:release-candidate-local') fail('maker_product_portfolio_drift')
const website = manifest.customerProducts?.find((product) => product.id === 'website')
if (website?.views?.join(',') !== 'Start,Edit,Preview,Download'
  || website?.templates?.some((template) => template.workflow?.at(-1) !== 'Download website')
  || website?.headline !== 'Turn a short business brief into a usable website.') fail('website_download_trial_contract_drift')
const ecommerce = manifest.customerProducts?.find((product) => product.id === 'ecommerce')
if (ecommerce?.views?.join(',') !== 'Storefront,Preview,Request receipt,Shop inbox,Shop review'
  || !ecommerce?.proof?.includes('Idempotent receipt and exact managed replay')
  || !ecommerce?.proof?.includes('Exact retained-ledger membership')
  || !ecommerce?.proof?.includes('Revision, action-identity, and cross-tenant conflict rejection')
  || !ecommerce?.proof?.includes('Bootstrap recovery')
  || !ecommerce?.proof?.includes('Human-confirmed source-locked Shop draft')
  || !ecommerce?.boundaries?.includes('No isolated hosted tenant proof')
  || !ecommerce?.boundaries?.includes('Managed inbox uses a 100-entry revisioned Shop workspace pilot envelope; a normalized indexed queue is gated on measured scale')
  || !ecommerce?.boundaries?.includes('No Shop order or stock reservation before separate accountable confirmation')) fail('ecommerce_request_receipt_contract_drift')
if (manifest.sharedCapabilities?.map((capability) => `${capability.id}:${capability.status}`).join(',') !== 'ai-assistance:gated-r-and-d') fail('shared_capability_drift')
for (const product of manifest.customerProducts || []) {
  if (product.templates?.length !== 3) fail('public_template_count_wrong', { product: product.id })
  for (const template of product.templates || []) {
    if (!template.outcome?.trim() || !template.metric?.trim() || template.workflow?.length < 5 || template.entryPoints?.length < 3) fail('public_template_contract_incomplete', { product: product.id, template: template.id })
  }
}
if (manifest.pages?.map((page) => page.route).join(',') !== '/,/contact/,/privacy/') fail('public_page_surface_not_minimal')

const expectedStaticFiles = new Set([
  ...manifest.pages.map((page) => page.file),
  '404.html',
  '__release.json',
  'favicon.svg',
  'robots.txt',
  'site.webmanifest',
  'sitemap.xml',
])
const actualStaticFiles = walkFiles(staticDir)
for (const path of actualStaticFiles) {
  if (!expectedStaticFiles.has(path)) fail('unapproved_public_artifact', { path })
}
for (const path of expectedStaticFiles) {
  if (!actualStaticFiles.includes(path)) fail('expected_public_artifact_missing', { path })
}

const sharedRequired = [
  `meta name="supermega-brand-version" content="${manifest.brand.version}"`,
  `meta name="supermega-context-version" content="${manifest.contextVersion}"`,
  `data-brand-version="${manifest.brand.version}"`,
  'href="/favicon.svg?v=',
  'aria-label="SuperMega home"',
  '<span class="brand-mark" aria-hidden="true">&gt;_</span>',
  '<span class="brand-name">SUPERMEGA</span>',
  'href="/privacy/">Privacy</a>',
  'Accountable company software.',
]

const forbiddenCopy = [
  ...manifest.retiredPublicNames,
  'Custom software at SaaS prices',
  'Three products',
  'public agent',
  'agent company',
  'autonomous employee',
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
]
const encodingCorruption = ['\uFFFD', '\u00e2\u20ac\u201d', '\u00e2\u20ac\u201c', '\u00c2', '\u00f0\u0178']

const pages = new Map(manifest.pages.map((page) => [page.route, { ...page, html: readStatic(page.file) }]))
for (const [route, page] of pages) {
  if (!page.html.includes(`<title>${page.title}</title>`)) fail('page_title_drift', { route, expected: page.title })
  for (const token of sharedRequired) {
    if (!page.html.includes(token)) fail('shared_brand_contract_missing', { route, token })
  }
  for (const token of forbiddenCopy) {
    if (page.html.toLowerCase().includes(token.toLowerCase())) fail('retired_public_context_present', { route, token })
  }
  for (const marker of encodingCorruption) {
    if (page.html.includes(marker)) fail('public_copy_encoding_corrupt', { route })
  }
  if (/\b(?:USD|MMK)\b|\$\s*\d|\d[\d,]*\s*(?:MMK|kyat)/i.test(page.html)) fail('public_price_present', { route })
  if (/target\s*=\s*["']?_blank/i.test(page.html) || page.html.includes('window.open(')) fail('new_tab_navigation_present', { route })
  if (page.html.includes('href="/solutions/"') || page.html.includes('href="/trust/"')) fail('retired_public_navigation_present', { route })
  if (!page.html.includes(`<link rel="canonical" href="${new URL(route, `${manifest.release.productionDomain}/`).href}"`)) fail('canonical_url_wrong', { route })
  if (route !== '/' && !page.html.includes('href="/contact/">Contact</a>')) fail('support_footer_contact_missing', { route })
}

const home = pages.get('/')?.html || ''
if (/\.brand-name\s*\{[^}]*display\s*:\s*none/i.test(home)) fail('mobile_brand_name_hidden')
for (const token of [
  manifest.company.headline,
  manifest.company.supporting,
  'Four separate products',
  'One secure foundation',
  'Mobile-ready workflows',
  'aria-label="Core capabilities"',
  'min-height: 44px',
  'id="products"',
  'SuperMega products',
  'Open a working product.',
  'Each product starts with a usable sample. Explore the main job first; configuration and data import stay out of the way until you need them.',
  'Choose a product',
  'Need a workspace for your company?',
  'id="trust"',
  'aria-label="Security boundary"',
  'AI may prepare drafts from approved records.',
  'https://app.supermega.dev/shop/?tab=counter',
  'https://app.supermega.dev/plant/?tab=production',
  'id="website"',
  'https://app.supermega.dev/website/',
  'id="ecommerce"',
  'Create a Shop-backed storefront and hand customer intent to human review.',
  'https://app.supermega.dev/ecommerce/',
]) {
  if (!home.includes(token)) fail('homepage_contract_missing', { token })
}
for (const product of manifest.customerProducts || []) {
  if (!home.includes(product.appRoute)) fail('direct_product_route_missing', { product: product.id })
  for (const capability of (product.modules?.length ? product.modules : product.workflow).slice(0, 3)) {
    if (!home.includes(capability)) fail('module_catalog_missing', { product: product.id, capability })
  }
}
if ((home.match(/>Open product<\/a>/g) || []).length !== 4) fail('direct_product_cta_count_wrong')
if (home.includes('Start guided trial') || home.includes('app.supermega.dev/settings/?product=') || home.includes('aria-label="Templates"')) fail('setup_first_public_path_returned')
for (const internalLabel of ['SuperMega HQ', 'One next action for the company', 'Owners, evidence, review, and release', 'Gated R&amp;D']) {
  if (home.includes(internalLabel)) fail('internal_system_exposed_on_public_home', { internalLabel })
}
for (const retiredLabel of ['>Open Commerce<', '>Open Production<']) {
  if (home.includes(retiredLabel)) fail('ambiguous_demo_cta_present', { retiredLabel })
}
if (home.includes('Commerce and Production carry real records and actions.')) fail('unsupported_live_record_claim_present')
if ((home.match(/<a\b/g) || []).length > 8) fail('homepage_link_surface_too_large')

const contact = pages.get('/contact/')?.html || ''
for (const token of ['data-contact-form', 'action="/api/contact-submissions"', 'name="name"', 'name="email"', 'name="company"', 'name="product"', 'value="shop"', 'value="plant"', 'value="website"', 'value="ecommerce"', 'name="template"', 'name="goal"', 'name="idempotency_key"', 'name="website" tabindex="-1" autocomplete="off" aria-hidden="true" inert', 'x-idempotency-key', 'rate_limited', 'Describe one real workflow or recurring handoff, and note any screenshot or spreadsheet you can share.', '>Shop<', '>Plant<', '>Website<', '>Ecommerce<', 'No account, data connection, automation, or external action begins from this form.', 'swanhtet@supermega.dev']) {
  if (!contact.includes(token)) fail('contact_contract_missing', { token })
}
if (contact.includes('value="agents"') || contact.includes('>AI Agent Solutions<')) fail('shared_capability_listed_as_contact_product')

const privacy = pages.get('/privacy/')?.html || ''
for (const token of ['Contact requests', 'Product data', 'AI processing', 'Deletion']) {
  if (!privacy.includes(token)) fail('privacy_contract_missing', { token })
}

const favicon = readStatic('favicon.svg')
for (const token of ['SuperMega terminal mark', manifest.brand.colors.background, manifest.brand.colors.accent, manifest.brand.colors.ink]) {
  if (!favicon.includes(token)) fail('brand_mark_contract_missing', { token })
}

const release = JSON.parse(readStatic('__release.json'))
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

const sitemap = readStatic('sitemap.xml')
for (const page of manifest.pages) {
  const canonical = new URL(page.route, `${manifest.release.productionDomain}/`).href
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
for (const token of ['supermega_leads', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'TELEGRAM_BOT_TOKEN', 'SUPERMEGA_LEAD_WEBHOOK_URL', 'SUPERMEGA_CONTACT_IDEMPOTENCY_SECRET', 'required_fields_missing', 'idempotency_key_required', 'idempotency_conflict', 'rate_limited', 'resolution=ignore-duplicates,return=representation', "'idempotency-key'"]) {
  if (!contactFunction.includes(token)) fail('contact_runtime_contract_missing', { token })
}
if (/require\(['"]pg['"]\)|DATABASE_URL|postgres/i.test(contactFunction)) fail('public_contact_has_direct_postgres_access')

const config = JSON.parse(readFileSync(configPath, 'utf8'))
if (config.version !== 3 || !Array.isArray(config.routes)) fail('vercel_config_shape_invalid')
if (config.crons) fail('public_artifact_must_not_define_crons')
for (const redirect of manifest.redirects) {
  const route = config.routes.find((entry) => entry.src === redirect.source)
  if (route?.status !== 308 || route?.headers?.Location !== redirect.destination) fail('retired_route_redirect_missing', { redirect, actual: route })
}
for (const route of [
  ['^/api/contact-submissions/status/?$', '/api/contact-submissions.js'],
  ['^/api/contact-submissions/?$', '/api/contact-submissions.js'],
  ['^/api/health/?$', '/api/health.js'],
]) {
  if (!config.routes.some((entry) => entry.src === route[0] && entry.dest === route[1])) fail('public_api_route_missing', { route })
}
if (!config.routes.some((entry) => entry.handle === 'filesystem')) fail('filesystem_route_missing')
if (!config.routes.some((entry) => entry.src === '^/(.*)$' && entry.status === 404 && entry.dest === '/404.html')) fail('not_found_route_missing')

console.log(JSON.stringify({
  ok: true,
  contract: 'supermega_public_output',
  pages: [...pages.keys()],
  functions: functionNames,
  staticFiles: actualStaticFiles.length,
  release,
}, null, 2))

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative, resolve } from 'node:path'

const root = process.cwd()
const staticDir = resolve(root, '.vercel', 'output', 'static')
const functionsDir = resolve(root, '.vercel', 'output', 'functions', 'api')
const configPath = resolve(root, '.vercel', 'output', 'config.json')
const manifest = JSON.parse(readFileSync(resolve(root, 'site-manifest.json'), 'utf8'))
const visionProof = JSON.parse(readFileSync(resolve(root, 'evidence', 'vision-service-proof.json'), 'utf8'))

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
if (manifest.customerProducts?.map((product) => product.appRoute).join(',') !== 'https://app.supermega.dev/shop/,https://app.supermega.dev/plant/,https://app.supermega.dev/website/,https://app.supermega.dev/ecommerce/') fail('customer_product_routes_drift')
const operatingProducts = manifest.customerProducts?.filter((product) => product.kind === 'operating-product') || []
const makerProducts = manifest.customerProducts?.filter((product) => product.kind === 'maker-product') || []
const serviceProducts = manifest.serviceProducts || []
const publicProducts = [...(manifest.customerProducts || []), ...serviceProducts]
if (operatingProducts.map((product) => product.id).join(',') !== 'shop,plant') fail('operating_product_portfolio_drift')
if (makerProducts.map((product) => `${product.id}:${product.status}`).join(',') !== 'website:available-in-app,ecommerce:release-candidate-local') fail('maker_product_portfolio_drift')
if (serviceProducts.map((product) => `${product.id}:${product.status}`).join(',') !== 'vision:founding-pilot-local') fail('service_product_portfolio_drift')
const website = manifest.customerProducts?.find((product) => product.id === 'website')
if (website?.views?.join(',') !== 'Start,Edit,Preview,Download'
  || website?.templates?.some((template) => template.workflow?.at(-1) !== 'Download website')
  || website?.headline !== 'Turn a short business brief into a usable website.') fail('website_download_trial_contract_drift')
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
const vision = serviceProducts.find((product) => product.id === 'vision')
if (vision?.headline !== 'Teach one repetitive screen workflow and measure it locally.'
  || !vision?.proof?.includes('Sealed Windows runtime')
  || !vision?.proof?.includes('Android AAR and APK packages')
  || !vision?.proof?.includes('Replayable buyer evaluation kit')
  || !vision?.boundaries?.includes('No credential handling')
  || !vision?.boundaries?.includes('No consequential action without separate exact approval')) fail('vision_founding_pilot_contract_drift')
if (visionProof.contract !== 'supermega.vision.service-proof.v1'
  || !/^[a-f0-9]{40}$/.test(visionProof.sourceCommit || '')
  || !/^[a-f0-9]{40}$/.test(visionProof.sourceTree || '')
  || visionProof.verification?.tests !== 264
  || visionProof.verification?.exitCode !== 0
  || visionProof.verification?.passed !== true
  || Object.keys(visionProof.claims || {}).join('|') !== vision.proof.join('|')
  || !visionProof.limitations?.includes('Physical Android performance remains unproven until the owner-selected device passes the device gate.')
  || !visionProof.limitations?.includes('No buyer workflow, customer screenshots, production automation, or commercial acceptance is proven by the engineering suite.')) fail('vision_service_proof_snapshot_invalid')
if (manifest.sharedCapabilities?.map((capability) => `${capability.id}:${capability.status}`).join(',') !== 'ai-assistance:gated-r-and-d') fail('shared_capability_drift')
for (const product of publicProducts) {
  if (product.templates?.length !== 3) fail('public_template_count_wrong', { product: product.id })
  for (const template of product.templates || []) {
    if (!template.outcome?.trim() || !template.metric?.trim() || template.workflow?.length < 5 || template.entryPoints?.length < 3) fail('public_template_contract_incomplete', { product: product.id, template: template.id })
  }
}
if (manifest.pages?.map((page) => page.route).join(',') !== '/,/vision/,/contact/,/privacy/') fail('public_page_surface_not_minimal')

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
  '<a class="button compact header-cta" href="https://app.supermega.dev/login">Company sign in</a>',
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
  'Four managed products',
  'One Vision founding service',
  'Mobile-ready workflows',
  'aria-label="Core capabilities"',
  'min-height: 44px',
  'id="products"',
  'Products and services',
  'Open a product or request a focused pilot.',
  'Shop, Plant, Website, and Ecommerce open working samples. Vision starts with a qualified four-week founding pilot request.',
  'Need a workspace for your company?',
  'id="trust"',
  'aria-label="Security boundary"',
  'AI may prepare drafts from approved records.',
  'https://app.supermega.dev/shop/',
  'https://app.supermega.dev/plant/',
  'id="website"',
  'https://app.supermega.dev/website/',
  'id="ecommerce"',
  'Create a Shop-backed storefront and hand customer intent to human review.',
  'https://app.supermega.dev/ecommerce/',
  'id="vision"',
  'Teach one repetitive screen workflow and measure it locally.',
  '/vision/',
  'Explore founding pilot',
]) {
  if (!home.includes(token)) fail('homepage_contract_missing', { token })
}
for (const product of publicProducts) {
  const destination = product.kind === 'service-product' ? product.publicRoute : product.appRoute
  if (!home.includes(destination)) fail('direct_product_route_missing', { product: product.id })
  for (const capability of (product.modules?.length ? product.modules : product.workflow).slice(0, 3)) {
    if (!home.includes(capability)) fail('module_catalog_missing', { product: product.id, capability })
  }
}
if ((home.match(/>Open product<\/a>/g) || []).length !== 4 || (home.match(/>Explore founding pilot<\/a>/g) || []).length !== 1) fail('direct_product_cta_count_wrong')
if (home.includes('https://app.supermega.dev/vision/')) fail('vision_dead_app_route_present')
if (home.includes('Start guided trial') || home.includes('app.supermega.dev/settings/?product=') || home.includes('aria-label="Templates"')) fail('setup_first_public_path_returned')
for (const internalLabel of ['SuperMega HQ', 'One next action for the company', 'Owners, evidence, review, and release', 'Gated R&amp;D']) {
  if (home.includes(internalLabel)) fail('internal_system_exposed_on_public_home', { internalLabel })
}
for (const retiredLabel of ['>Open Commerce<', '>Open Production<']) {
  if (home.includes(retiredLabel)) fail('ambiguous_demo_cta_present', { retiredLabel })
}
if (home.includes('Commerce and Production carry real records and actions.')) fail('unsupported_live_record_claim_present')
if ((home.match(/<a\b/g) || []).length > 9) fail('homepage_link_surface_too_large')
const visionPage = pages.get('/vision/')?.html || ''
for (const token of [vision.headline, vision.description, 'Good first workflows', 'Four-week founding pilot', 'From approved screens to measured evidence.', 'What you receive', 'Portable evidence, not a hidden demo.', 'Request founding pilot', 'Qualify the pilot', '/contact/?product=vision&amp;template=release-qa', 'It does not upload screenshots or start work.', 'Native packages are built and sealed for the agreed pilot.', "Physical Android performance remains unproven until the buyer's approved device passes its device gate.", ...vision.templates.map((template) => template.name), ...vision.templates.map((template) => template.outcome), ...vision.workflow, ...vision.boundaries]) {
  if (!visionPage.includes(token)) fail('vision_page_contract_missing', { token })
}
for (const template of vision.templates) {
  if (!visionPage.includes(`/contact/?product=vision&amp;template=${template.id}`)) fail('vision_template_cta_missing', { template: template.id })
}
if (visionPage.includes('https://app.supermega.dev/vision/') || !visionPage.includes('<link rel="canonical" href="https://supermega.dev/vision/"')) fail('vision_page_route_contract_wrong')

const contact = pages.get('/contact/')?.html || ''
for (const token of ['data-contact-form', 'action="/api/contact-submissions"', 'name="name"', 'name="email"', 'name="company"', 'name="product"', 'value="shop"', 'value="plant"', 'value="website"', 'value="ecommerce"', 'value="vision"', 'name="template"', 'name="goal"', 'name="idempotency_key"', 'name="proof_contract"', 'name="proof_version"', 'name="proof_digest"', 'name="proof_product"', 'name="proof_template"', 'name="proof_readiness"', 'name="proof_sources"', 'name="proof_behavior"', 'name="proof_decisions"', 'proof_outcome', 'proof_outcome_digest', 'proof_outcome_accepted', 'name="proof_raw_records"', 'data-vision-fields hidden', 'name="vision_platform"', 'name="vision_state_count"', 'name="vision_weekly_runs"', 'name="vision_minutes_per_run"', 'name="vision_labor_hourly_usd"', 'name="vision_screenshot_rights"', 'name="vision_human_fallback"', 'name="vision_observation_only"', "product.value==='vision'", 'class="contact-honeypot" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" inert', 'x-idempotency-key', 'rate_limited', 'trial_proof_invalid', 'Describe one real workflow or recurring handoff, and note any screenshot or spreadsheet you can share.', '>Shop<', '>Plant<', '>Website<', '>Ecommerce<', '>Vision<', 'No account, data connection, automation, or external action begins from this form.', 'Reply email', 'data-contact-heading', 'data-contact-lede', 'data-contact-copy-heading', 'data-contact-copy', 'data-trial-proof', 'Client-provided trial proof', 'Reviewed setup summary', 'it does not verify a managed account.', 'digest-bound aggregate summary', 'location.hash.slice(1)', "handoff.get('company')", "handoff.get('goal')", "history.replaceState(null,'',location.pathname+location.search)", "heading.textContent='Finish your '+productName+' request.'", 'Your company and goal are already filled. Add your name and reply email, review the request, then send it.', 'Only this summary moves forward. No raw product records, account connection, automation, or external action begins from this form.', 'Raw records, questions, approval contents, and account details stay out.', 'Trial summary attached for review. Nothing has been sent.', 'Trial summary detached. Review the updated request before sending.', 'Company and goal are ready for review from your AI memory.', 'Request received:', 'Keep this ID for follow-up.', 'Too many requests from this connection. Please wait ten minutes and try again.', 'Could not route the request here. Please wait and try again.']) {
  if (!contact.includes(token)) fail('contact_contract_missing', { token })
}
if (contact.includes('mailto:') || contact.includes('tel:') || contact.includes('Email swanhtet@supermega.dev')) fail('contact_bypass_links_returned')
if (contact.includes('value="agents"') || contact.includes('>AI Agent Solutions<')) fail('shared_capability_listed_as_contact_product')
if (/<[^>]+\sstyle=/.test(contact)) fail('contact_inline_style_returned')

const privacy = pages.get('/privacy/')?.html || ''
for (const token of ['Contact requests', 'Product data', 'AI processing', 'Deletion', 'optional trial proof summary, outcome status, and digest', 'digest-bound aggregate outcome', 'excludes raw product records, questions, approval contents, and account details', 'Vision qualification', 'target device, number of visual states, weekly frequency, minutes per run, optional labor estimate', 'screenshot rights, human fallback, and an observation-only first pilot', 'only to qualify the request and prepare a local proposal draft', 'This form does not upload screenshots or capture your screen.']) {
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
for (const token of ['supermega_leads', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'TELEGRAM_BOT_TOKEN', 'SUPERMEGA_LEAD_WEBHOOK_URL', 'SUPERMEGA_CONTACT_IDEMPOTENCY_SECRET', 'required_fields_missing', 'vision_fields_missing', 'vision_screenshot_rights', 'human_fallback', 'observation_only', 'idempotency_key_required', 'idempotency_conflict', 'rate_limited', 'supermega.managed_trial_proof.v2', 'proof_outcome', 'proof_outcome_digest', 'proof_outcome_accepted', 'trial_proof_invalid', 'client_provided_summary', 'CONTACT_FINGERPRINT_CURRENT_VERSION', 'proof_bound', 'privacyUrl', 'resolution=ignore-duplicates,return=representation', "'idempotency-key'"]) {
  if (!contactFunction.includes(token)) fail('contact_runtime_contract_missing', { token })
}
if (/require\(['"]pg['"]\)|DATABASE_URL|postgres/i.test(contactFunction)) fail('public_contact_has_direct_postgres_access')

const config = JSON.parse(readFileSync(configPath, 'utf8'))
if (config.version !== 3 || !Array.isArray(config.routes)) fail('vercel_config_shape_invalid')
if (config.crons) fail('public_artifact_must_not_define_crons')
const securityRoute = config.routes.find((entry) => entry.src === '^/(.*)$' && entry.continue === true && entry.headers?.['content-security-policy'])
if (!securityRoute) fail('public_security_header_route_missing')
const csp = securityRoute.headers['content-security-policy']
const styleBody = contact.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''
const scriptBody = contact.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''
const expectedStyleHash = `'sha256-${createHash('sha256').update(styleBody).digest('base64')}'`
const expectedScriptHash = `'sha256-${createHash('sha256').update(scriptBody).digest('base64')}'`
for (const token of ["default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'", "script-src-attr 'none'", "style-src-attr 'none'", expectedStyleHash, expectedScriptHash]) {
  if (!csp.includes(token)) fail('public_csp_contract_missing', { token })
}
if (csp.includes("'unsafe-inline'") || csp.includes("'unsafe-eval'")) fail('public_csp_unsafe_policy')
for (const [name, value] of Object.entries({ 'cross-origin-opener-policy': 'same-origin', 'cross-origin-resource-policy': 'same-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' })) {
  if (securityRoute.headers[name] !== value) fail('public_security_header_missing', { name, expected: value, actual: securityRoute.headers[name] })
}
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

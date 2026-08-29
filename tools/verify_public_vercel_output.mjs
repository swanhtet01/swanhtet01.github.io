import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
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
if (manifest.customerProducts?.map((product) => product.appRoute).join(',') !== 'https://app.supermega.dev/shop/,https://app.supermega.dev/plant/,https://app.supermega.dev/website/,https://app.supermega.dev/ecommerce/') fail('customer_product_routes_drift')
const operatingProducts = manifest.customerProducts?.filter((product) => product.kind === 'operating-product') || []
const makerProducts = manifest.customerProducts?.filter((product) => product.kind === 'maker-product') || []
const publicProducts = manifest.customerProducts || []
if (operatingProducts.map((product) => product.id).join(',') !== 'shop,plant') fail('operating_product_portfolio_drift')
if (makerProducts.map((product) => `${product.id}:${product.status}`).join(',') !== 'website:available-in-app,ecommerce:release-candidate-local') fail('maker_product_portfolio_drift')
const website = manifest.customerProducts?.find((product) => product.id === 'website')
if (website?.views?.join(',') !== 'Start,Edit,Preview,Download'
  || website?.templates?.some((template) => template.workflow?.at(-1) !== 'Download website')
  || website?.headline !== 'Build a simple company website from a brief.') fail('website_download_trial_contract_drift')
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
  'vercel-insights.js',
  'og-card.png',
  ...manifest.customerProducts.map((product) => `og-card-${product.id}.png`),
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
  '<a class="skip-link" href="#content">Skip to content</a>',
  'id="content"',
  '.skip-link:focus { transform: translateY(0); }',
  'aria-label="SuperMega home"',
  '<span class="brand-mark" aria-hidden="true">&gt;_</span>',
  '<span class="brand-name">SUPERMEGA</span>',
  '<a class="button compact header-cta" href="https://app.supermega.dev/login">Company sign in</a>',
  '<script src="/vercel-insights.js"></script>',
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
  if (!/<meta name="description" content="[^"]{20,}" \/>/.test(page.html)) fail('page_description_missing', { route })
  // Landing pages carry their per-product share card; every other page keeps the generic card.
  const pageShareImage = new URL(page.productId ? `/og-card-${page.productId}.png` : '/og-card.png', `${manifest.release.productionDomain}/`).href
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
  if (page.productId && page.html.includes(`content="${new URL('/og-card.png', `${manifest.release.productionDomain}/`).href}"`)) fail('landing_page_generic_share_card_present', { route })
  if (route !== '/' && !page.html.includes('href="/contact/">Contact</a>')) fail('support_footer_contact_missing', { route })
}
const pageTitles = manifest.pages.map((page) => page.title)
if (new Set(pageTitles).size !== pageTitles.length) fail('page_titles_not_unique')

// JSON-LD structured data: the homepage carries one Organization schema and each
// product landing page one Product schema, sourced verbatim from the manifest.
// Every JSON-LD element must keep type="application/ld+json" so it remains an
// HTML data block that browsers never execute — that is what keeps the pinned
// single-hash script-src contract valid without hashing these blocks.
const jsonLdBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => match[1])
const executableScriptCount = (html) => (html.match(/<script(?![^>]*type="application\/ld\+json")[\s>]/g) || []).length
for (const [route, page] of pages) {
  const expectedExecutable = route === '/contact/' ? 2 : 1
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
      || schema.description !== manifest.company.statement) fail('organization_schema_drift', { route, schema })
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
  '["/","/shop/","/plant/","/website/","/ecommerce/","/contact/","/privacy/"]',
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
if (/\.brand-name\s*\{[^}]*display\s*:\s*none/i.test(home)) fail('mobile_brand_name_hidden')
for (const token of [
  manifest.company.headline,
  manifest.company.supporting,
  'Four focused products',
  'Working samples',
  'Mobile-ready workflows',
  'role="group" aria-label="Core capabilities"',
  '--quiet: #5f6c64;',
  '@media (max-width: 520px)',
  '.compact-solution .module-tags { display: none; }',
  'min-height: 44px',
  'href="#products">Choose a product</a>',
  'id="products"',
  '>Products<',
  'Choose one product to try.',
  'Name the business, choose its type, and start with one guided job. Real client data stays optional until the workflow makes sense.',
  'id="model" aria-label="Free and managed SuperMega"',
  'Free product. Managed intelligence.',
  'Run the products free. Add managed company intelligence when the workflow proves value.',
  'Operate without a stripped-down plan.',
  'Every workflow visible in Shop, Plant, Website, and Ecommerce remains available in the browser workspace.',
  'Grounded answers from validated local records',
  'No account or model call required',
  'Use approved context across products.',
  'Approved AI context across all four products',
  'Persistent company history and role-aware access',
  'Reviewed recommendations and accountable actions',
  'Managed activation proceeds only after identity, tenant isolation, recovery, and write controls pass for the company.',
  'href="/contact/?product=guide&amp;source=managed-intelligence">Request managed pilot</a>',
  'id="trust"',
  'aria-label="Security boundary"',
  'Every real send, payment, publish, access change, stock movement, or production write stays behind explicit authority and verified server-side controls.',
  'https://app.supermega.dev/settings/?product=shop',
  'https://app.supermega.dev/settings/?product=plant',
  'id="website"',
  'https://app.supermega.dev/settings/?product=website',
  'id="ecommerce"',
  'Create a Shop-connected ordering page.',
  'https://app.supermega.dev/settings/?product=ecommerce',
]) {
  if (!home.includes(token)) fail('homepage_contract_missing', { token })
}
for (const product of publicProducts) {
  const guidedSampleRoute = `https://app.supermega.dev/settings/?product=${encodeURIComponent(product.id)}`
  if (!home.includes(guidedSampleRoute)) fail('guided_product_route_missing', { product: product.id })
  for (const capability of (product.modules?.length ? product.modules : product.workflow).slice(0, 3)) {
    if (!home.includes(capability)) fail('module_catalog_missing', { product: product.id, capability })
  }
}
if ((home.match(/>Start free sample<\/a>/g) || []).length !== 4) fail('guided_product_cta_count_wrong')
if ((home.match(/>Request managed pilot<\/a>/g) || []).length !== 1) fail('managed_pilot_cta_count_wrong')
if (home.includes('Start guided trial') || home.includes('aria-label="Templates"')) fail('retired_public_setup_copy_returned')
for (const product of publicProducts) {
  if (home.includes(`href="${product.appRoute}"`)) fail('direct_product_route_remains_primary', { product: product.id })
  if (!home.includes(`href="/${product.id}/">${product.name} overview</a>`)) fail('landing_route_link_missing', { product: product.id })
}
for (const internalLabel of ['SuperMega HQ', 'One next action for the company', 'Owners, evidence, review, and release', 'Gated R&amp;D']) {
  if (home.includes(internalLabel)) fail('internal_system_exposed_on_public_home', { internalLabel })
}
for (const retiredLabel of ['>Open Commerce<', '>Open Production<']) {
  if (home.includes(retiredLabel)) fail('ambiguous_demo_cta_present', { retiredLabel })
}
if (home.includes('Commerce and Production carry real records and actions.')) fail('unsupported_live_record_claim_present')
// 13 content links plus the shared skip-to-content link on every page.
if ((home.match(/<a\b/g) || []).length > 14) fail('homepage_link_surface_too_large')

for (const product of publicProducts) {
  const landingRoute = `/${product.id}/`
  const landing = pages.get(landingRoute)?.html || ''
  const guidedSampleRoute = `https://app.supermega.dev/settings/?product=${encodeURIComponent(product.id)}`
  const setupLabel = product.secondaryCta?.label || `Set up ${product.name} data`
  const allModules = product.modules?.length ? product.modules : product.id === 'website' ? product.workflow : product.views
  const launchModules = allModules.slice(0, manifest.templatePackPolicy.maxEnabledModulesAtLaunch)
  for (const token of [
    product.eyebrow,
    `<h1>${product.headline}</h1>`,
    `href="${guidedSampleRoute}"`,
    '>Start free sample</a>',
    `href="/contact/?product=${product.id}">${setupLabel}</a>`,
    'Free browser sample',
    'Mobile-ready workflows',
    'Start here',
    `${launchModules.length} core ${product.name} workflows.`,
    'Advanced tools stay inside the workspace and appear when they are relevant.',
    'Use the core workflow before adding complexity.',
    `The ${launchModules.length} core workflows above`,
    'Separate client portal',
    'No automatic send or payment',
    'No account or model call required',
    'aria-label="Security boundary"',
    'Every real send, payment, publish, access change, stock movement, or production write stays behind explicit authority and verified server-side controls.',
    'Free product. Managed intelligence.',
    'Managed activation proceeds only after identity, tenant isolation, recovery, and write controls pass for the company.',
  ]) {
    if (!landing.includes(token)) fail('landing_page_contract_missing', { route: landingRoute, token })
  }
  if (landing.includes(`href="${product.appRoute}"`)) fail('landing_direct_product_route_present', { route: landingRoute })
  for (const capability of launchModules) {
    if (!landing.includes(capability)) fail('landing_module_missing', { route: landingRoute, capability })
  }
  for (const capability of allModules.slice(manifest.templatePackPolicy.maxEnabledModulesAtLaunch)) {
    if (landing.includes(capability)) fail('advanced_module_exposed_before_relevance', { route: landingRoute, capability })
  }
  if ((landing.match(/<div class="solution-modules"[\s\S]*?<\/div>/)?.[0].match(/<span><i>/g) || []).length !== launchModules.length) fail('launch_module_count_wrong', { route: landingRoute })
}

const contact = pages.get('/contact/')?.html || ''
for (const token of ['data-contact-form', 'action="/api/contact-submissions"', 'name="name"', 'name="email"', 'name="company"', 'name="product"', 'value="shop"', 'value="plant"', 'value="website"', 'value="ecommerce"', 'name="template"', 'name="goal"', 'name="idempotency_key"', 'name="proof_contract"', 'name="proof_version"', 'name="proof_digest"', 'name="proof_product"', 'name="proof_template"', 'name="proof_readiness"', 'name="proof_sources"', 'name="proof_behavior"', 'name="proof_decisions"', 'proof_outcome', 'proof_outcome_digest', 'proof_outcome_accepted', 'name="proof_raw_records"', 'class="contact-honeypot" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" inert', 'x-idempotency-key', 'rate_limited', 'trial_proof_invalid', 'Describe one real workflow or recurring handoff, and note any screenshot or spreadsheet you can share.', '>Shop<', '>Plant<', '>Website<', '>Ecommerce<', 'No account, data connection, automation, or external action begins from this form.', 'Reply email', 'data-contact-heading', 'data-contact-lede', 'data-contact-copy-heading', 'data-contact-copy', 'data-trial-proof', 'Client-provided trial proof', 'Reviewed setup summary', 'it does not verify a managed account.', 'digest-bound aggregate summary', 'location.hash.slice(1)', '/^(guide|shop|plant|website|ecommerce)$/.test(requestedProduct||\'\')', "handoff.get('company')", "handoff.get('goal')", "history.replaceState(null,'',location.pathname+location.search)", "heading.textContent='Finish your '+productName+' request.'", 'Your company and goal are already filled. Add your name and reply email, review the request, then send it.', 'Only this summary moves forward. No raw product records, account connection, automation, or external action begins from this form.', 'Raw records, questions, approval contents, and account details stay out.', 'Trial summary attached for review. Nothing has been sent.', 'Trial summary detached. Review the updated request before sending.', 'Company and goal are ready for review from your AI memory.', 'Request received:', 'Keep this ID for follow-up.', 'Too many requests from this connection. Please wait ten minutes and try again.', 'Could not route the request here. Please wait and try again.']) {
  if (!contact.includes(token)) fail('contact_contract_missing', { token })
}
if (contact.includes('mailto:') || contact.includes('tel:') || contact.includes('Email swanhtet@supermega.dev')) fail('contact_bypass_links_returned')
for (const token of ["query.get('source')==='managed-intelligence'", "if(managedIntelligenceRequest&&!handoff.toString())", 'Request managed company intelligence.', 'Describe the first Shop, Plant, Website, or Ecommerce workflow that should use approved company context.', 'Start with one proven workflow.', 'tenant boundary, recovery plan, and actions that must stay review-gated.', "submit.textContent='Request managed pilot'"]) {
  if (!contact.includes(token)) fail('managed_intelligence_contact_contract_missing', { token })
}
if (/<(?:input|textarea)\b(?=[^>]*\bname="(?:name|email|company|template|goal)")(?=[^>]*\bvalue=)[^>]*>/i.test(contact)
  || /<textarea\b(?=[^>]*\bname="goal")[^>]*>\s*[^<\s]/i.test(contact)) fail('contact_user_field_prefilled')
if (contact.includes('value="agents"') || contact.includes('>AI Agent Solutions<')) fail('shared_capability_listed_as_contact_product')
if (/<[^>]+\sstyle=/.test(contact)) fail('contact_inline_style_returned')

const privacy = pages.get('/privacy/')?.html || ''
for (const token of ['Contact requests', 'Product data', 'AI processing', 'Deletion', 'optional trial proof summary, outcome status, and digest', 'digest-bound aggregate outcome', 'excludes raw product records, questions, approval contents, and account details']) {
  if (!privacy.includes(token)) fail('privacy_contract_missing', { token })
}

const favicon = readStatic('favicon.svg')
for (const token of ['SuperMega terminal mark', manifest.brand.colors.background, manifest.brand.colors.accent, manifest.brand.colors.ink]) {
  if (!favicon.includes(token)) fail('brand_mark_contract_missing', { token })
}

for (const cardFile of ['og-card.png', ...manifest.customerProducts.map((product) => `og-card-${product.id}.png`)]) {
  const ogCardPath = resolve(staticDir, cardFile)
  requireFile(ogCardPath, cardFile)
  const ogCard = readFileSync(ogCardPath)
  if (!ogCard.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) fail('og_card_not_png', { cardFile })
  if (ogCard.readUInt32BE(16) !== 1200 || ogCard.readUInt32BE(20) !== 630) fail('og_card_dimensions_wrong', { cardFile, width: ogCard.readUInt32BE(16), height: ogCard.readUInt32BE(20) })
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
const styleBody = contact.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''
const scriptBody = contact.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''
const expectedStyleHash = `'sha256-${createHash('sha256').update(styleBody).digest('base64')}'`
const expectedScriptHash = `'sha256-${createHash('sha256').update(scriptBody).digest('base64')}'`
for (const token of ["default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'", "script-src-attr 'none'", "style-src-attr 'none'", expectedStyleHash, expectedScriptHash]) {
  if (!csp.includes(token)) fail('public_csp_contract_missing', { token })
}
if (csp.includes("'unsafe-inline'") || csp.includes("'unsafe-eval'")) fail('public_csp_unsafe_policy')
for (const [name, value] of Object.entries({ 'cross-origin-opener-policy': 'same-origin', 'cross-origin-resource-policy': 'same-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' })) {
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
if (!config.routes.some((entry) => entry.src === '^/vercel-insights\\.js$' && entry.continue === true && entry.headers?.['cache-control'] === 'no-store, max-age=0')) fail('public_observability_no_store_route_missing')
if (!config.routes.some((entry) => entry.src === '^/(?:favicon\\.svg|site\\.webmanifest|og-card(?:-(?:shop|plant|website|ecommerce))?\\.png)$' && entry.continue === true && entry.headers?.['cache-control'])) fail('static_asset_cache_route_missing')
if (!config.routes.some((entry) => entry.handle === 'filesystem')) fail('filesystem_route_missing')
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

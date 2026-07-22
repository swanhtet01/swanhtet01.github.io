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
if (manifest.schemaVersion !== 'supermega.site-context.v1') fail('manifest_schema_changed')
if (manifest.company?.publicPricing !== false) fail('public_pricing_enabled')
if (manifest.release?.sourceBranch !== 'main') fail('release_source_not_main')
if (manifest.products?.map((product) => product.id).join(',') !== 'shop,plant') fail('public_catalog_not_shop_and_plant')

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
  'href="/solutions/"',
  'href="https://app.supermega.dev/">Open app</a>',
  'href="/trust/">Trust</a>',
  'Company systems with accountable automation.',
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
  if (!page.html.includes(`<link rel="canonical" href="${new URL(route, `${manifest.release.productionDomain}/`).href}"`)) fail('canonical_url_wrong', { route })
}

const home = pages.get('/')?.html || ''
for (const token of [
  manifest.company.headline,
  manifest.company.supporting,
  'Operations and agents share the same truth.',
  'Run the work',
  'Scale the team',
  'Move faster without pretending autonomy is authority.',
  'Start with one broken workflow.',
]) {
  if (!home.includes(token)) fail('homepage_contract_missing', { token })
}

const solutions = pages.get('/solutions/')?.html || ''
for (const token of [
  'One operating layer. Four clear surfaces.',
  'Shop and Plant are operating modes, not separate brands.',
  'https://app.supermega.dev/operations/?view=shop',
  'https://app.supermega.dev/operations/?view=plant',
  'https://app.supermega.dev/agents/',
  'A team machine with explicit boundaries.',
  'Configure the difference. Keep the foundation.',
]) {
  if (!solutions.includes(token)) fail('solutions_contract_missing', { token })
}
for (const product of manifest.products) {
  for (const template of product.templates) {
    for (const token of [template.name, template.outcome, `product=${product.id}&amp;template=${template.id}`]) {
      if (!solutions.includes(token)) fail('template_catalog_missing', { product: product.id, template: template.id, token })
    }
  }
}

const trust = pages.get('/trust/')?.html || ''
for (const token of ['Automation earns authority.', 'id="governed-ai"', 'Human approval', 'Least authority', 'Source grounded', 'Recovery designed']) {
  if (!trust.includes(token)) fail('trust_contract_missing', { token })
}

const contact = pages.get('/contact/')?.html || ''
for (const token of ['data-contact-form', 'action="/api/contact-submissions"', 'name="name"', 'name="email"', 'name="company"', 'name="product"', 'name="template"', 'name="goal"', 'name="idempotency_key"', 'x-idempotency-key', 'rate_limited', 'No account, data connection, automation, or external action begins from this form.', 'swanhtet@supermega.dev']) {
  if (!contact.includes(token)) fail('contact_contract_missing', { token })
}

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

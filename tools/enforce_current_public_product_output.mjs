import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const outputRoot = resolve(root, '.vercel', 'output')
const staticDir = resolve(outputRoot, 'static')

function fail(message, extra = {}) {
  console.error(JSON.stringify({ status: 'error', message, ...extra }, null, 2))
  process.exit(1)
}

function readStatic(relativePath) {
  const fullPath = resolve(staticDir, relativePath)
  if (!existsSync(fullPath)) fail('missing_static_file', { relativePath })
  return readFileSync(fullPath, 'utf8')
}

function requireTokens(label, text, tokens) {
  const missing = tokens.filter((token) => !text.includes(token))
  if (missing.length) fail('public_front_door_missing_tokens', { label, missing })
}

const home = readStatic('index.html')
const contact = readStatic('contact/index.html')
const sitemap = readStatic('sitemap.xml')
const configPath = resolve(outputRoot, 'config.json')
if (!existsSync(configPath)) fail('missing_public_config')
const config = JSON.parse(readFileSync(configPath, 'utf8'))

requireTokens('home', home, [
  '<title>SuperMega | Open the app or try the demo</title>',
  '<h1 id="supermega-heading">SuperMega</h1>',
  'https://app.supermega.dev/',
  'https://demo.supermega.dev/',
  'Need something built?',
  'app.supermega.dev',
  'demo.supermega.dev',
  '/favicon.svg',
])

for (const forbidden of [
  '<figure class="site-hero-screen"',
  '<img src="/site/shots/live-product-',
  'Explore products',
  '>Products<',
  '>Pricing<',
  '>AI workers<',
  'Custom Solutions &amp; AI Agents',
  'Shop, Plant',
  'supermega-portal-card.png',
]) {
  if (home.includes(forbidden)) fail('catalog_copy_or_stale_product_visual_on_home', { forbidden })
}

for (const forbidden of ['placeholder="Drive folder', 'placeholder="Example:', '14-day money-back guarantee', 'Source link or system', 'Upload files', 'custom AI worker']) {
  if (contact.includes(forbidden)) fail('contact_surface_is_not_blank_or_honest', { forbidden })
}

const legacyCatalogRoute = (config.routes || []).find(
  (route) => route.src === '^/(?:products|offers|pricing|plans|packages|agent-templates|ai-agents)(?:/.*)?$',
)
if (legacyCatalogRoute?.status !== 308 || legacyCatalogRoute?.headers?.Location !== '/') {
  fail('legacy_catalog_route_not_retired', { actual: legacyCatalogRoute })
}
const demoRoute = (config.routes || []).find((route) => route.src === '^/demo/?$')
if (demoRoute?.status !== 308 || demoRoute?.headers?.Location !== 'https://demo.supermega.dev/') {
  fail('legacy_demo_route_not_forwarded', { actual: demoRoute })
}

for (const allowed of ['https://supermega.dev/', 'https://supermega.dev/contact/', 'https://supermega.dev/privacy/']) {
  if (!sitemap.includes(allowed)) fail('front_door_sitemap_missing_entry', { allowed })
}
for (const retired of ['/products/', '/offers/', '/agent-templates/', '/ai-agents/', '/work/']) {
  if (sitemap.includes(`https://supermega.dev${retired}`)) fail('retired_catalog_route_in_sitemap', { retired })
}

console.log('[public-front-door-guard] simplified public front door verified')

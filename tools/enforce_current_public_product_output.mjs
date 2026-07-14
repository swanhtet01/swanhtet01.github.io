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
  '<title>supermega.dev | Shop and Plant</title>',
  '<h1 id="portfolio-heading">Run the operation. See what matters.</h1>',
  'supermega<span class="domain">.dev</span>',
  '&gt;_</span>',
  'https://app.supermega.dev/?demo=shop',
  'https://app.supermega.dev/?demo=plant',
  'Two working products',
  'Try first. Add data later.',
  '<strong>Shop</strong>',
  '<strong>Plant</strong>',
  'AI Agent Solutions',
  'Need a repeated task handled?',
  '>Contact us</a>',
  'src="/live-shop-workspace.png"',
  '/favicon.svg',
])

for (const forbidden of [
  '<figure class="site-hero-screen"',
  '<img src="/site/shots/live-product-',
  'Explore products',
  '>Products<',
  '>Pricing<',
  '>AI workers<',
  'supermega-portal-card.png',
  'https://demo.supermega.dev/',
  'The intelligent workspace for daily operations.',
  'Explore live demos',
  'Open workspace',
  'target="_blank"',
  'rotate(',
  'data-hero-media',
  'Current build',
  'Build an agent solution',
  '>Agent solution<',
]) {
  if (home.includes(forbidden)) fail('catalog_copy_or_stale_product_visual_on_home', { forbidden })
}

for (const forbidden of ['placeholder="Drive folder', 'placeholder="Example:', '14-day money-back guarantee', 'Source link or system', 'Upload files', 'custom AI worker']) {
  if (contact.includes(forbidden)) fail('contact_surface_is_not_blank_or_honest', { forbidden })
}

const legacyCatalogRoute = (config.routes || []).find(
  (route) => route.src === '^/(?:products|product|offers|pricing|plans|packages|agent-templates|ai-agents|work|operator|machine|card|megaos-preview|free)(?:/.*)?$',
)
if (legacyCatalogRoute?.status !== 308 || legacyCatalogRoute?.headers?.Location !== '/') {
  fail('legacy_catalog_route_not_retired', { actual: legacyCatalogRoute })
}
const demoRoute = (config.routes || []).find((route) => route.src === '^/demo/?$')
if (demoRoute?.status !== 308 || demoRoute?.headers?.Location !== 'https://demo.supermega.dev/') {
  fail('legacy_demo_route_not_forwarded', { actual: demoRoute })
}

for (const src of [
  '^/(?:agentops|agentops-toolbox|ai-back-office|back-office-operator|back-office-workflow-desk|openclaw|office-operator|try|book|setup|get-started|intake|free-tools|free-tool|builder|tool-builder|scan|calculator|workflow-scan|daily-close|payment-close|close-checker|mmqr|store-tool|agent-builder|agent-scope|ai-agent|agent-tool|agents|about|demos|demo-center|enterprise-demo|modules|portal-types|implementation|how-it-works|portfolio|tools|value|proof|platform|solutions|find-companies|company-list|task-list|receiving-log)/?$',
]) {
  const route = (config.routes || []).find((entry) => entry.src === src)
  if (route?.status !== 308 || route?.headers?.Location !== '/') {
    fail('retired_catalog_alias_not_redirected_home', { src, actual: route })
  }
}

for (const allowed of ['https://supermega.dev/', 'https://supermega.dev/contact/', 'https://supermega.dev/privacy/']) {
  if (!sitemap.includes(allowed)) fail('front_door_sitemap_missing_entry', { allowed })
}
for (const retired of ['/products/', '/offers/', '/agent-templates/', '/ai-agents/', '/work/']) {
  if (sitemap.includes(`https://supermega.dev${retired}`)) fail('retired_catalog_route_in_sitemap', { retired })
}

console.log('[public-front-door-guard] simplified public front door verified')

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

const expectedStaticEntries = new Set(['404.html', 'contact', 'favicon.svg', 'index.html', 'live-shop-dashboard.png', 'privacy', 'robots.txt', 'site.webmanifest', 'sitemap.xml', 'sw.js'])
const actualStaticEntries = readdirSync(staticDir)
for (const entry of actualStaticEntries) {
  if (!expectedStaticEntries.has(entry)) fail('retired_public_static_entry_present', { entry })
}
for (const entry of expectedStaticEntries) {
  if (!actualStaticEntries.includes(entry)) fail('required_public_static_entry_missing', { entry })
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

const home = readText('index.html')
const contact = readText('contact/index.html')
const privacy = readText('privacy/index.html')
const notFound = readText('404.html')
const pages = new Map([
  ['index.html', home],
  ['contact/index.html', contact],
  ['privacy/index.html', privacy],
  ['404.html', notFound],
])

for (const [relativePath, html] of pages) {
  for (const required of ['data-theme="light"', 'data-theme="dark"', 'prefers-color-scheme', 'prefers-reduced-motion', 'data-theme-toggle']) {
    if (!html.includes(required)) fail('public_page_missing_theme_contract', { relativePath, required })
  }
  for (const forbidden of ['>Products<', '>Pricing<', '>AI workers<', '/site/shots/', 'supermega-portal-card.png', 'WorkDesk', 'AgentOps', 'Source-to-Screen', 'AI Workcell']) {
    if (html.includes(forbidden)) fail('public_page_contains_retired_catalog_content', { relativePath, forbidden })
  }
}

for (const required of [
  '<h1 id="supermega-heading">SuperMega</h1>',
  'https://app.supermega.dev/',
  'https://app.supermega.dev/?demo=shop',
  'https://demo.supermega.dev/',
  'Need something built?',
  'src="/favicon.svg"',
  'src="/live-shop-dashboard.png"',
  'site.webmanifest',
]) {
  if (!home.includes(required)) fail('homepage_front_door_contract_missing', { required })
}

for (const required of ['action="/api/contact-submissions"', 'name="name"', 'name="email"', 'name="company"', 'name="goal"', 'No account or data connection is made before you approve it.']) {
  if (!contact.includes(required)) fail('contact_surface_contract_missing', { required })
}
for (const forbidden of ['placeholder="Drive folder', 'placeholder="Example:', 'Upload files', 'Source link or system', 'custom AI worker']) {
  if (contact.includes(forbidden)) fail('contact_surface_keeps_retired_intake', { forbidden })
}

for (const required of ['Only the details needed to reply.', 'Sending a contact request does not create an account or connect any data source.']) {
  if (!privacy.includes(required)) fail('privacy_surface_contract_missing', { required })
}

const manifest = JSON.parse(readText('site.webmanifest'))
if (manifest.name !== 'SuperMega' || manifest.start_url !== '/' || manifest.icons?.[0]?.src !== '/favicon.svg') {
  fail('webmanifest_contract_invalid', { manifest })
}

const sitemap = readText('sitemap.xml')
for (const required of ['https://supermega.dev/', 'https://supermega.dev/contact/', 'https://supermega.dev/privacy/']) {
  if (!sitemap.includes(required)) fail('sitemap_missing_current_page', { required })
}
for (const forbidden of ['/products/', '/pricing/', '/ai-agents/', '/agent-templates/', '/offers/']) {
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
const catalogRoute = findRoute(routes, '^/(?:products|product|offers|pricing|plans|packages|agent-templates|ai-agents|work|operator|machine|card|megaos-preview|free)(?:/.*)?$')
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

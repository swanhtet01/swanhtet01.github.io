import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const staticDir = resolve(root, '.vercel', 'output', 'static')
const failures = []

const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
const fail = (name, extra = {}) => failures.push({ name, ...extra })

function requireTokens(label, text, tokens) {
  for (const token of tokens) {
    if (!text.includes(token)) fail(`${label}_missing_token`, { token })
  }
}

function rejectTokens(label, text, tokens) {
  for (const token of tokens) {
    if (text.includes(token)) fail(`${label}_retired_token_found`, { token })
  }
}

const source = read(resolve(root, 'tools', 'create_public_vercel_output.mjs'))
const pages = {
  home: read(resolve(staticDir, 'index.html')),
  products: read(resolve(staticDir, 'products', 'index.html')),
  offers: read(resolve(staticDir, 'offers', 'index.html')),
  agents: read(resolve(staticDir, 'ai-agents', 'index.html')),
  contact: read(resolve(staticDir, 'contact', 'index.html')),
}

if (!source) fail('missing_public_generator')
for (const [label, html] of Object.entries(pages)) {
  if (!html) fail(`missing_public_${label}_output`)
}

requireTokens('generator_two_suite_redesign', source, [
  "replace(/\\bRetail OS\\b/g, 'Shop')",
  "replace(/\\bFactory OS\\b/g, 'Plant')",
  'Custom software, built for your business.',
  'custom-ai-agent-build',
])

requireTokens('home_two_suite_redesign', pages.home, [
  '<h1>SuperMega</h1>',
  'site-hero-screen',
  '<strong>Shop</strong>',
  '<strong>Plant</strong>',
  'Custom Solutions &amp; AI Agents',
  'Powered by SuperMega Technologies',
])

requireTokens('products_two_suite_redesign', pages.products, [
  '<h2>Shop.</h2>',
  '<h2>Plant.</h2>',
  'Custom Solutions & AI Agents',
  '/products/pos/',
  '/products/factory/',
])

requireTokens('offers_two_suite_redesign', pages.offers, [
  'Clear scope. Clear starting point.',
  'Tool in a week',
  'Custom build',
  'AI agent / automation',
  'Design + ship system',
  'Start with a real workflow.',
])

requireTokens('agents_redirect_to_products', pages.agents, [
  'Continue to SuperMega',
  'url=/products/',
  'window.location.replace("/products/")',
  'Explore products',
])

requireTokens('contact_two_suite_intake', pages.contact, [
  'Tell us what needs to work better.',
  'Source link or system',
  'custom-ai-agent-build',
])

const retiredPublicOfferTokens = [
  'AI Workcell Pilot',
  'Source-to-Screen',
  'source_to_screen',
  'data-source-to-screen',
  'package=ai-workcell-pilot',
  'Agents that do the tasks SaaS leaves for humans',
  'AI Agent Army',
  'Free core tools',
]

for (const [label, html] of Object.entries(pages)) {
  rejectTokens(label, html, retiredPublicOfferTokens)
  const priceMatch = html.match(/\bUSD\b|\$\s?\d/)
  if (priceMatch) fail(`${label}_contains_public_usd_price`, { match: priceMatch[0] })
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2))
  process.exit(1)
}

console.log('public_shop_plant_ai_workers_contract=verified')

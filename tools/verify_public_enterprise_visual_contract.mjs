import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const staticDir = resolve(root, '.vercel', 'output', 'static')

function fail(message, extra = {}) {
  console.error(JSON.stringify({ status: 'error', message, ...extra }, null, 2))
  process.exit(1)
}

function readPage(relativePath) {
  const target = resolve(staticDir, relativePath)
  if (!existsSync(target)) fail('missing_public_page', { relativePath })
  return readFileSync(target, 'utf8')
}

const buyerPages = [
  'index.html',
  'products/index.html',
  'products/pos/index.html',
  'products/factory/index.html',
  'products/documents/index.html',
  'offers/index.html',
  'work/index.html',
  'contact/index.html',
  'agent-templates/index.html',
  'privacy/index.html',
]

const pages = new Map(buyerPages.map((relativePath) => [relativePath, readPage(relativePath)]))
const home = pages.get('index.html')
const products = pages.get('products/index.html')
const offers = pages.get('offers/index.html')
const contact = pages.get('contact/index.html')
const agentTemplates = pages.get('agent-templates/index.html')

for (const required of [
  'data-theme="light"',
  'data-theme="dark"',
  'prefers-color-scheme',
  'prefers-reduced-motion',
  'site-hero-screen',
  '/site/shots/live-product-restaurant-pos-menu-inventory.png',
  'SuperMega',
]) {
  if (!home.includes(required)) fail('homepage_visual_contract_missing', { required })
}

for (const [relativePath, html] of pages) {
  if (html.includes('href="/demo/"') || html.includes('>Demos<')) {
    fail('buyer_page_uses_generic_demo_route', { relativePath })
  }
  if (html.includes('Retail OS') || html.includes('Factory OS')) {
    fail('buyer_page_uses_retired_product_name', { relativePath })
  }
  if (!html.includes('data-theme-toggle')) {
    fail('buyer_page_missing_theme_control', { relativePath })
  }
}

for (const required of [
  'Shop.',
  'Plant.',
  'Custom Solutions & AI Agents',
  '/site/shots/live-product-factory-issues-maintenance-quality.png',
  '/site/shots/live-product-build-app-from-workflow.png',
]) {
  if (!products.includes(required)) fail('products_visual_contract_missing', { required })
}

for (const forbidden of ['placeholder="Drive folder', 'placeholder="Example:', '14-day money-back guarantee']) {
  if (contact.includes(forbidden)) fail('contact_surface_is_not_blank_or_honest', { forbidden })
}
for (const forbidden of ['Role-aware onboarding', 'Device-aware onboarding', 'Adaptive setup plan', 'First proof planner']) {
  if (contact.includes(forbidden)) fail('contact_surface_contains_internal_onboarding', { forbidden })
}

if (!agentTemplates.includes('/site/shots/live-product-build-app-from-workflow.png')) {
  fail('agent_template_page_missing_real_product_visual')
}
for (const forbidden of ['Role-aware onboarding', 'Device-aware onboarding', 'Adaptive setup plan', 'First proof planner']) {
  if (agentTemplates.includes(forbidden)) fail('agent_template_page_contains_internal_onboarding', { forbidden })
}

if (!offers.includes('/site/shots/live-product-build-app-from-workflow.png')) {
  fail('offers_page_missing_real_workflow_visual')
}

console.log(JSON.stringify({ status: 'ok', contract: 'public_enterprise_visual', pages_checked: buyerPages.length }))

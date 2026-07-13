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

const publicPages = [
  'index.html',
  'contact/index.html',
  'privacy/index.html',
  '404.html',
]

const pages = new Map(publicPages.map((relativePath) => [relativePath, readPage(relativePath)]))
const home = pages.get('index.html')
const contact = pages.get('contact/index.html')

for (const [relativePath, html] of pages) {
  for (const required of ['data-theme="light"', 'data-theme="dark"', 'prefers-color-scheme', 'prefers-reduced-motion', 'data-theme-toggle']) {
    if (!html.includes(required)) fail('public_page_missing_theme_contract', { relativePath, required })
  }
  for (const forbidden of ['>Products<', '>Pricing<', '>AI workers<']) {
    if (html.includes(forbidden)) fail('public_page_keeps_catalog_navigation', { relativePath, forbidden })
  }
}

for (const required of [
  'https://app.supermega.dev/',
  'https://demo.supermega.dev/',
  'target="_blank"',
  'rel="noopener noreferrer"',
  'One place to start',
  'Need something built?',
  'class="launch-mark"',
  'src="/favicon.svg"',
]) {
  if (!home.includes(required)) fail('homepage_front_door_contract_missing', { required })
}

for (const forbidden of ['<figure class="site-hero-screen"', '<img src="/site/shots/live-product-', 'Explore products', 'Custom Solutions &amp; AI Agents', 'supermega-portal-card.png']) {
  if (home.includes(forbidden)) fail('homepage_stale_catalog_visual_or_copy', { forbidden })
}

for (const forbidden of ['placeholder="Drive folder', 'placeholder="Example:', 'Role-aware onboarding', 'Device-aware onboarding', 'Adaptive setup plan', 'First proof planner']) {
  if (contact.includes(forbidden)) fail('contact_surface_is_not_blank_or_honest', { forbidden })
}

console.log(JSON.stringify({ status: 'ok', contract: 'public_front_door_visual', pages_checked: publicPages.length }))

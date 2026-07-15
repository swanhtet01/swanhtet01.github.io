import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const staticDir = resolve(process.cwd(), '.vercel', 'output', 'static')

function fail(message, extra = {}) {
  console.error(JSON.stringify({ status: 'error', message, ...extra }, null, 2))
  process.exit(1)
}

function readPage(relativePath) {
  const target = resolve(staticDir, relativePath)
  if (!existsSync(target)) fail('missing_public_page', { relativePath })
  return readFileSync(target, 'utf8')
}

const publicPages = ['index.html', 'work/index.html', 'contact/index.html', 'privacy/index.html', '404.html']
const pages = new Map(publicPages.map((relativePath) => [relativePath, readPage(relativePath)]))
const home = pages.get('index.html')
const work = pages.get('work/index.html')
const contact = pages.get('contact/index.html')

for (const [relativePath, html] of pages) {
  for (const required of ['data-theme="light"', 'data-theme="dark"', 'prefers-color-scheme', 'prefers-reduced-motion', 'data-theme-toggle']) {
    if (!html.includes(required)) fail('public_page_missing_theme_contract', { relativePath, required })
  }
  for (const forbidden of ['>Products<', '>Pricing<', '>AI workers<', 'target="_blank"', 'target=_blank', 'window.open(', '>SM<', 'File Analyst', 'Payment Reconciler', 'data-clean-report-agent', 'supermega-machine.vercel.app/workcell', 'href="/reconcile/"']) {
    if (html.includes(forbidden)) fail('public_page_keeps_retired_catalog_content', { relativePath, forbidden })
  }
}

for (const required of [
  'href="/work/"',
  'https://app.supermega.dev/?demo=shop',
  'https://app.supermega.dev/?demo=plant',
  '<h1 id="portfolio-heading">Operational software, built to fit.</h1>',
  'data-product-preview',
  'data-preview-open',
  'src="/live-shop-workspace.png"',
  "src:'/live-plant-workspace.png'",
  '<h2 id="workspaces-heading">Start close to the real work.</h2>',
  'Two working systems',
  'Use working screens',
  'Your private workspace is configured and verified before handover.',
  'Keep AI accountable',
  '<h2 id="brief-heading">Tell us where the workflow breaks.</h2>',
  '>Describe your workflow</a>',
  '<img src="/favicon.svg" alt="" width="64" height="64" />',
  'href="/favicon.svg"',
]) {
  if (!home.includes(required)) fail('homepage_front_door_contract_missing', { required })
}

for (const required of [
  '<h1 id="work-heading">See the work before the pitch.</h1>',
  'class="work-signal"',
  'class="case-band"',
  'class="case-band alt"',
  '<h2 id="shop-case-heading">Keep the day together.</h2>',
  '<h2 id="plant-case-heading">Give the floor a memory.</h2>',
  'class="case-media"',
  'backdrop-filter: blur(22px)',
  '<h2 id="work-close-heading">One useful workflow is enough to start.</h2>',
]) {
  if (!work.includes(required)) fail('work_page_visual_contract_missing', { required })
}

for (const forbidden of ['<figure class="site-hero-screen"', '<img src="/site/shots/live-product-', 'Explore products', 'Custom Solutions &amp; AI Agents', 'supermega-portal-card.png', 'https://demo.supermega.dev/', 'Need a repeated task handled?', 'rotate(', 'id="products"', '[data-reveal] { opacity: 0']) {
  if (home.includes(forbidden)) fail('homepage_stale_catalog_visual_or_copy', { forbidden })
}

if (!contact.includes('.header-cta { display: none; }')) fail('contact_page_keeps_redundant_start_control')
for (const forbidden of ['placeholder="Drive folder', 'placeholder="Example:', 'Role-aware onboarding', 'Device-aware onboarding', 'Adaptive setup plan', 'First proof planner']) {
  if (contact.includes(forbidden)) fail('contact_surface_is_not_blank_or_honest', { forbidden })
}

console.log(JSON.stringify({ status: 'ok', contract: 'public_front_door_visual', pages_checked: publicPages.length }))

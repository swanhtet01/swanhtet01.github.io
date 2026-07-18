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
const shopStartHref = 'https://app.supermega.dev/?demo=shop&amp;returnTo=%2Fstart'
const plantStartHref = 'https://app.supermega.dev/?demo=plant&amp;returnTo=%2Fstart'

for (const [relativePath, html] of pages) {
  for (const required of ['data-theme="light"', 'data-theme="dark"', 'prefers-color-scheme', 'prefers-reduced-motion', 'data-theme-toggle', 'min-width: 44px;\n    min-height: 44px;', '>Talk to us</a>']) {
    if (!html.includes(required)) fail('public_page_missing_theme_contract', { relativePath, required })
  }
  for (const required of [shopStartHref, plantStartHref]) {
    if (!html.includes(required)) fail('public_page_missing_guided_start', { relativePath, required })
  }
  for (const forbidden of ['href="https://app.supermega.dev/?demo=shop"', 'href="https://app.supermega.dev/?demo=plant"']) {
    if (html.includes(forbidden)) fail('public_page_contains_unguided_workspace_entry', { relativePath, forbidden })
  }
  for (const forbidden of ['>Products<', '>Pricing<', '>AI workers<', 'target="_blank"', 'target=_blank', 'window.open(', '>SM<', 'File Analyst', 'Payment Reconciler', 'data-clean-report-agent', 'supermega-machine.vercel.app/workcell', 'href="/reconcile/"']) {
    if (html.includes(forbidden)) fail('public_page_keeps_retired_catalog_content', { relativePath, forbidden })
  }
}

for (const required of [
  'href="/work/"',
  shopStartHref,
  plantStartHref,
  "href:'https://app.supermega.dev/?demo=shop&returnTo=%2Fstart'",
  "href:'https://app.supermega.dev/?demo=plant&returnTo=%2Fstart'",
  '<h1 id="portfolio-heading">Run the day. Keep the handoffs.</h1>',
  'data-product-preview',
  'data-preview-open',
  'class="hero-product-picker"',
  'data-product-preview-description',
  '>Open Shop demo</a>',
  'href="/contact/?from=homepage-private-setup"',
  '>Private setup</a>',
  'src="/live-shop-workspace.png"',
  'data-product-preview-mobile-source',
  'srcset="/live-shop-mobile.png"',
  "mobileSrc:'/live-plant-mobile.png'",
  'Current Shop workspace showing priority checks, sales, cash, customers, and stock',
  "src:'/live-plant-workspace.png'",
  '<h2 id="workspaces-heading">Start with the work that matters.</h2>',
  'Two working systems',
  'Private workspaces add supervised, data-grounded decision support after approved sources are connected.',
  '<h2 id="brief-heading">Bring us the handoff that still breaks.</h2>',
  '>Start with one workflow</a>',
  '<img src="/favicon.svg" alt="" width="64" height="64" />',
  'href="/favicon.svg"',
]) {
  if (!home.includes(required)) fail('homepage_front_door_contract_missing', { required })
}

for (const required of [
  '<h1 id="work-heading">See the work before the pitch.</h1>',
  'Open Shop or Plant in the same tab and follow a real operating path.',
  'class="work-stage"',
  'class="work-product-picker"',
  'data-product-preview',
  'data-preview-proof-link',
  'data-product-preview-description',
  '>Open Shop demo</a>',
  'class="work-proof"',
  'class="work-proof-toolbar"',
  'aria-label="Open the live Shop workspace"',
  'fetchpriority="high"',
  'class="case-band"',
  'class="case-band alt"',
  '<h2 id="shop-case-heading">Keep the day together.</h2>',
  '<h2 id="plant-case-heading">Give the floor a memory.</h2>',
  'class="case-media"',
  'class="case-actions"',
  'class="case-point"',
  'aria-label="Try a Shop workflow"',
  'aria-label="Try a Plant workflow"',
  'https://app.supermega.dev/?demo=shop&amp;returnTo=%2Fsales%3Fview%3Dclose',
  'https://app.supermega.dev/?demo=plant&amp;returnTo=%2Fplan',
  'https://app.supermega.dev/?demo=plant&amp;returnTo=%2Fhandoff',
  '.case-toolbar .btn { min-height: 44px; }',
  'srcset="/live-shop-mobile.png"',
  'Current Shop workspace showing priority checks, sales, cash, customers, and stock',
  'srcset="/live-plant-mobile.png"',
  'Current Plant workspace showing production plan navigation and machine state across two lines',
  'href="/contact/?from=shop-workspace"',
  'href="/contact/?from=plant-workspace"',
  'backdrop-filter: blur(22px)',
  '<h2 id="work-close-heading">One useful workflow is enough to start.</h2>',
]) {
  if (!work.includes(required)) fail('work_page_visual_contract_missing', { required })
}

for (const forbidden of ['<figure class="site-hero-screen"', '<img src="/site/shots/live-product-', 'Explore products', 'Custom Solutions &amp; AI Agents', 'supermega-portal-card.png', 'https://demo.supermega.dev/', 'Need a repeated task handled?', 'rotate(', 'id="products"', '[data-reveal] { opacity: 0']) {
  if (home.includes(forbidden)) fail('homepage_stale_catalog_visual_or_copy', { forbidden })
}

if (!contact.includes('.header-cta { display: none; }')) fail('contact_page_keeps_redundant_start_control')
if (!contact.includes('<h1 data-contact-heading>What should run better?</h1>')) fail('contact_page_missing_direct_sales_prompt')
for (const required of [
  "var privateSetupIntent=entryIntent==='homepage-private-setup';",
  "form.dataset.intake=workspaceProduct?entryIntent:'private-workspace';",
  "text('[data-contact-heading]','Set up a private workspace.');",
  "text('[data-contact-form-heading]','Private setup');",
  "text('[data-contact-goal-label]','What should be ready first?');",
  'class="contact-intro"',
  'class="contact-support"',
  'grid-template-areas: "intro form" "support form"',
  'grid-template-areas: "intro" "form" "support"',
  'data-workspace-choice',
  'data-workspace-choice-button="shop"',
  'data-workspace-choice-button="plant"',
  'data-workspace-choice-button="guide"',
  'Choose the first workspace',
  'revealWorkspaceChoice(initialWorkspaceChoice);',
  'normalizeWorkspaceGoal();',
]) {
  if (!contact.includes(required)) fail('contact_page_missing_private_setup_handoff', { required })
}
for (const required of ['class="contact-next"', '<h2 id="contact-next-heading">What happens next</h2>', 'We read the handoff', 'We name the smallest next step', 'You approve before setup', 'No account, data connection, or external action starts without approval.']) {
  if (!contact.includes(required)) fail('contact_page_missing_first_step_guidance', { required })
}
for (const forbidden of ['placeholder="Drive folder', 'placeholder="Example:', 'Role-aware onboarding', 'Device-aware onboarding', 'Adaptive setup plan', 'First proof planner']) {
  if (contact.includes(forbidden)) fail('contact_surface_is_not_blank_or_honest', { forbidden })
}

console.log(JSON.stringify({ status: 'ok', contract: 'public_front_door_visual', pages_checked: publicPages.length }))

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const staticDir = resolve(root, '.vercel', 'output', 'static')
const failures = []

const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
const fail = (code, detail = {}) => failures.push({ code, ...detail })
const requireTokens = (label, text, tokens) => {
  for (const token of tokens) if (!text.includes(token)) fail(`${label}_missing_token`, { token })
}

const pricing = JSON.parse(read(resolve(root, 'pricing.json')) || '{}')
const customAi = (pricing.products || []).find((product) => product.key === 'custom-ai')
const oneAgentPrice = customAi?.tiers?.['One agent']
const pipelinePrice = customAi?.tiers?.['Pipeline build']
const products = read(resolve(staticDir, 'products', 'index.html'))
const contact = read(resolve(staticDir, 'contact', 'index.html'))
const contactApi = read(resolve(root, 'api', 'contact-submissions.js'))

if (!oneAgentPrice || !pipelinePrice) fail('canonical_custom_ai_prices_missing')
if (!products) fail('generated_products_page_missing')
if (!contact) fail('generated_contact_page_missing')
if (!contactApi) fail('contact_api_source_missing')

requireTokens('runtime_catalog', products, [
  'Three outcomes you can start without inventing a platform.',
  'id="operator-workcells"',
  '#operator-workcells { scroll-margin-top: 104px; }',
  'data-runtime-workcell="cash-close"',
  'data-runtime-workcell="pipeline-control"',
  'data-runtime-workcell="owner-command"',
  'A daily settled-cash, fees, net receipts, and exception brief.',
  'Revenue-at-risk deals matched against the team work queue.',
  'One daily action brief from the sales, cash, delivery, and issue updates already reaching the owner.',
  'Updates the owner forwards to one private Telegram bot',
  '/contact/?package=workcell-cash-close&amp;utm_source=products',
  '/contact/?package=workcell-pipeline-control&amp;utm_source=products',
  '/contact/?package=workcell-owner-command&amp;utm_source=products',
  'Read-only first run. No payment, refund, transfer, message, or accounting write.',
])

requireTokens('runtime_prices', products, [
  `From ${oneAgentPrice}`,
  `From ${pipelinePrice}`,
])

requireTokens('simple_contact_intake', contact, [
  'data-sm-contact-form',
  'General enquiry',
  'What do you need?',
  'No account or data connection is made before you approve it.',
])

for (const token of [
  'workcell-cash-close',
  'workcell-pipeline-control',
  'workcell-owner-command',
  'name="template_id"',
  'name="acceptance_tests"',
  'name="launch_blockers"',
  'name="automation_boundary"',
  'Owner Command turns the updates already reaching you',
]) {
  if (contact.includes(token)) fail('retired_workcell_catalog_leaked_into_contact', { token })
}

requireTokens('contact_order_packet', contactApi, [
  'const templateId = truncate(payload.template_id, 100)',
  'const acceptanceTests = truncate(payload.acceptance_tests, 900)',
  'const launchBlockers = truncate(payload.launch_blockers, 500)',
  'const automationBoundary = truncate(payload.automation_boundary, 700)',
  'template_id: templateId',
  'acceptance_tests: acceptanceTests',
  'launch_blockers: launchBlockers',
  'automation_boundary: automationBoundary',
  "requires_clickup_list: false",
  "modules: ['telegram_owner_updates_read', 'owner_command_brief', 'source_trace', 'owner_delivery', 'optional_approval_task_draft']",
])

const ownerCatalog = products.match(/<article class="runtime-workcell" data-runtime-workcell="owner-command">([\s\S]*?)<\/article>/)?.[1] || ''
if (!ownerCatalog) fail('owner_command_catalog_missing')
if (/PayPal|Pipedrive|ClickUp/i.test(ownerCatalog)) fail('owner_command_catalog_requires_external_saas')

for (const [label, html] of [['products', products], ['contact', contact]]) {
  if (/\bUSD\b|\$\s?\d/.test(html)) fail(`${label}_contains_public_usd_price`)
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'public_runtime_workcells', failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({
  ok: true,
  contract: 'public_runtime_workcells',
  workcells: ['cash-close', 'pipeline-control', 'owner-command'],
  pricingSource: 'pricing.json',
}, null, 2))

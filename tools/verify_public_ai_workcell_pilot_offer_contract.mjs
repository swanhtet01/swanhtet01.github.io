import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const staticDir = resolve(root, '.vercel', 'output', 'static')
const sourcePath = resolve(root, 'tools', 'create_public_vercel_output.mjs')
const failures = []

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function fail(name, extra = {}) {
  failures.push({ name, ...extra })
}

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

const source = read(sourcePath)
const home = read(resolve(staticDir, 'index.html'))
const products = read(resolve(staticDir, 'products', 'index.html'))
const offers = read(resolve(staticDir, 'offers', 'index.html'))
const agents = read(resolve(staticDir, 'ai-agents', 'index.html'))
const contact = read(resolve(staticDir, 'contact', 'index.html'))

if (!source) fail('missing_public_generator')
if (!home) fail('missing_public_home_output')
if (!products) fail('missing_public_products_output')
if (!offers) fail('missing_public_offers_output')
if (!agents) fail('missing_public_ai_agents_output')
if (!contact) fail('missing_public_contact_output')

requireTokens('generator_two_suite_redesign', source, [
  'Less chasing. More running.',
  "'Shop'",
  "'Plant'",
  'AI workflow solutions',
  'Try Shop live',
  'Try Plant live',
])

requireTokens('home_two_suite_redesign', home, [
  'Less chasing. More running.',
  'Try Shop live',
  'Try Plant live',
  'Start a conversation',
])

requireTokens('products_two_suite_redesign', products, [
  'Continue to SuperMega',
  'https://app.supermega.dev/?demo=shop',
])

requireTokens('offers_two_suite_redesign', offers, [
  'Continue to SuperMega',
  '/contact/?from=offers',
  'Talk to us',
])

requireTokens('agents_redirect_to_contact', agents, [
  'Continue to SuperMega',
  'url=/contact/?from=workflow',
  'window.location.replace("/contact/?from=workflow")',
  'Start with one workflow',
])

requireTokens('contact_two_suite_intake', contact, [
  'Tell us about your business.',
  'Shop for your shop, Plant for your factory floor.',
  'AI workflow solutions - from 11,000,000 MMK',
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

for (const [label, text] of [
  ['generator', source],
  ['home', home],
  ['products', products],
  ['offers', offers],
  ['agents', agents],
  ['contact', contact],
]) {
  rejectTokens(label, text, retiredPublicOfferTokens)
}

for (const [label, text] of [
  ['home', home],
  ['products', products],
  ['offers', offers],
  ['agents', agents],
  ['contact', contact],
]) {
  const hit = text.match(/\bUSD\b|\$\s?\d/)
  if (hit) fail(`${label}_contains_public_usd_price`, { match: hit[0] })
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2))
  process.exit(1)
}

console.log('public_two_suite_redesign_contract=verified')

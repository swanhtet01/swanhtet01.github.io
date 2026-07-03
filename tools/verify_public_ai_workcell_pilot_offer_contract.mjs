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

const source = read(sourcePath)
const home = read(resolve(staticDir, 'index.html'))
const offers = read(resolve(staticDir, 'offers', 'index.html'))
const agents = read(resolve(staticDir, 'ai-agents', 'index.html'))

if (!source) fail('missing_public_generator')
if (!home) fail('missing_public_home_output')
if (!offers) fail('missing_public_offers_output')
if (!agents) fail('missing_public_ai_agents_output')

const workcellTokens = [
  'AI Workcell Pilot',
  'Source pack',
  'First proof',
  'First production run',
  'Owner acceptance',
  'Maintenance',
  'approval-only',
  'payment proof',
  'proof-to-maintenance',
]

requireTokens('generator_workcell_offer', source, [
  ...workcellTokens,
  '/app/source-pack',
  '/app/proof-review',
  'Myanmar',
])

requireTokens('home_workcell_offer', home, [
  'Your whole business, in one simple app.',
  'Start free',
])

requireTokens('offers_workcell_offer', offers, [
  ...workcellTokens,
  'Premium setup',
  'easy setup',
  'private workspace',
  'customer success desk',
])

requireTokens('agents_workcell_offer', agents, [
  ...workcellTokens,
  'AI Agent Army',
  'Agents that do the tasks SaaS leaves for humans',
  'Every send, write, payment, browser/mobile action, or connector write waits for approval',
])

for (const [label, text] of [
  ['home', home],
  ['offers', offers],
  ['agents', agents],
]) {
  const hit = text.match(/\bUSD\b|\$\s?\d/)
  if (hit) fail(`${label}_contains_public_usd_price`, { match: hit[0] })
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2))
  process.exit(1)
}

console.log('public_ai_workcell_pilot_offer_contract=verified')

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
const home = read(resolve(staticDir, 'index.html'))
const contact = read(resolve(staticDir, 'contact', 'index.html'))

if (!source) fail('missing_public_generator')
if (!home) fail('missing_public_home_output')
if (!contact) fail('missing_public_contact_output')

requireTokens('generator_front_door', source, [
  'const simplifiedPublicShellHtml',
  "src: '^/(?:products|offers|pricing|plans|packages|agent-templates|ai-agents)(?:/.*)?$'",
  "Location: 'https://demo.supermega.dev/'",
])

requireTokens('home_front_door', home, [
  '<h1 id="supermega-heading">SuperMega</h1>',
  'https://app.supermega.dev/',
  'https://demo.supermega.dev/',
  'Need something built?',
  'Powered by SuperMega Technologies',
])

rejectTokens('home_front_door', home, [
  '<figure class="site-hero-screen"',
  '<img src="/site/shots/live-product-',
  '<strong>Shop</strong>',
  '<strong>Plant</strong>',
  'Custom Solutions &amp; AI Agents',
  '>Products<',
  '>Pricing<',
  '>AI workers<',
])

requireTokens('contact_front_door', contact, [
  'Tell us what needs to work better.',
  'What do you need?',
  'No account or data connection is made before you approve it.',
])

rejectTokens('contact_front_door', contact, [
  'Source link or system',
  'Upload files',
  'custom AI worker',
])

for (const [label, html] of [['home', home], ['contact', contact]]) {
  rejectTokens(label, html, [
    'AI Workcell Pilot',
    'Source-to-Screen',
    'source_to_screen',
    'data-source-to-screen',
    'package=ai-workcell-pilot',
    'Agents that do the tasks SaaS leaves for humans',
    'AI Agent Army',
  ])
  const priceMatch = html.match(/\bUSD\b|\$\s?\d/)
  if (priceMatch) fail(`${label}_contains_public_usd_price`, { match: priceMatch[0] })
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2))
  process.exit(1)
}

console.log('public_front_door_contract=verified')

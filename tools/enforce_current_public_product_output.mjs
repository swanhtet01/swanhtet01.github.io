import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const staticDir = resolve(root, '.vercel', 'output', 'static')

function fail(message, extra = {}) {
  console.error(JSON.stringify({ status: 'error', message, ...extra }, null, 2))
  process.exit(1)
}

function readStatic(relativePath) {
  const fullPath = resolve(staticDir, relativePath)
  if (!existsSync(fullPath)) fail('missing_static_file', { relativePath })
  return readFileSync(fullPath, 'utf8')
}

function requireTokens(label, text, tokens) {
  const missing = tokens.filter((token) => !text.includes(token))
  if (missing.length) fail('public_front_door_missing_tokens', { label, missing })
}

const home = readStatic('index.html')
const contact = readStatic('contact/index.html')

requireTokens('home', home, [
  '<title>supermega.dev | Shop and Plant, ready for real work.</title>',
  '<h1 id="portfolio-heading">Run the day. Keep the handoffs.</h1>',
  'supermega<span class="domain">.dev</span>',
  'terminal-cursor">_</span>',
  'https://app.supermega.dev/?demo=shop',
  'https://app.supermega.dev/?demo=plant',
  '>Talk to us</a>',
  'No signup',
  'Private setup',
  'src="/live-shop-workspace.png"',
  'data-product-preview-mobile-source',
  'srcset="/live-shop-mobile.png"',
  "mobileSrc:'/live-plant-mobile.png'",
  "src:'/live-plant-workspace.png'",
  '/favicon.svg',
])

requireTokens('contact', contact, [
  '<title>Contact | supermega.dev</title>',
  'What should run better?',
  'Choose the first workspace',
  'action="/api/contact-submissions"',
  'name="name"',
  'name="email"',
  'name="company"',
  'name="goal"',
  'No account or data connection is made before you approve it.',
])

for (const [label, text] of [['home', home], ['contact', contact]]) {
  for (const forbidden of [
    'AI Agent Solutions',
    'Build an agent solution',
    '>Agent solution<',
    'Need a repeated task handled?',
    'custom AI worker',
    'ai-agent-solution',
    'MegaOS',
    'DeskPOS',
    'target="_blank"',
  ]) {
    if (text.includes(forbidden)) fail('retired_public_product_copy_returned', { label, forbidden })
  }
}

console.log('[public-front-door-guard] Shop and Plant public surface verified')

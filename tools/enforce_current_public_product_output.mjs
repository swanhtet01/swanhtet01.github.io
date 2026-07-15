import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
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

function assertIncludes(label, text, phrases) {
  const currentPhrases = phrases.map((phrase) =>
    phrase.includes('your business, in one simple app')
      ? '<title>supermega.dev | Operating software for shops and plants</title>'
      : phrase,
  )
  const missing = currentPhrases.filter((phrase) => !text.includes(phrase))
  if (missing.length) fail('current_public_missing_tokens', { label, missing })
}

function assertPng(relativePath) {
  const filePath = resolve(staticDir, relativePath)
  if (!existsSync(filePath)) fail('missing_product_shot', { relativePath })
  const info = statSync(filePath)
  if (info.size < 1000) fail('product_shot_too_small', { relativePath, size: info.size })
  const bytes = readFileSync(filePath)
  if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) {
    fail('product_shot_not_png', { relativePath })
  }
}

function walkTextFiles(directory, prefix = '') {
  const entries = readdirSync(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name
    const fullPath = resolve(directory, entry.name)
    if (entry.isDirectory()) return walkTextFiles(fullPath, nextPrefix)
    if (!entry.isFile()) return []
    if (!/\.(?:html|js|css|json|txt|webmanifest)$/i.test(entry.name)) return []
    return [nextPrefix]
  })
}

const home = readStatic('index.html')
const products = readStatic('products/index.html')
const contact = readStatic('contact/index.html')
const textFiles = walkTextFiles(staticDir)
const combinedText = textFiles.map((entry) => readStatic(entry)).join('\n')

// Required product shots (live screenshots from current product builds).
const requiredProductShotPaths = [
  'site/shots/live-product-restaurant-pos-menu-inventory.png',
  'site/shots/live-product-factory-issues-maintenance-quality.png',
  'site/shots/live-product-build-app-from-workflow.png',
  'site/shots/live-demo-agent-builder.png',
  'site/shots/live-demo-service-desk.png',
  'site/shots/live-demo-industrial-os.png',
]

assertIncludes('home', home, [
  '<title>supermega.dev — your business, in one simple app</title>',
  'Less chasing. More running.',
])
assertIncludes('products', products, [
  'Continue to SuperMega',
  'https://app.supermega.dev/?demo=shop',
])
assertIncludes('contact', contact, ['<title>Contact | SUPERMEGA.dev</title>', 'Tell us about your business.', 'Shop for your shop, Plant for your factory floor.'])
assertIncludes('combined', combinedText, [
  'AI workflow solutions',
  'Plant',
  'Shop',
  '/contact/?from=offers',
])

for (const [label, text] of [
  ['home', home],
  ['products', products],
  ['contact', contact],
]) {
  const match = text.match(/Product Activation|Three products\. One setup contract|Quote-ready setup|View pricing|USD\s|Demo hub|Demo center|open demos|login demos|Request quote/i)
  if (match) fail('retired_public_copy_found', { label, match: match[0] })
}

const retiredCombinedMatch = combinedText.match(/AI Back Office Operator|WorkDesk Sprint|Managed WorkDesk|Managed AgentOps|AgentOps Toolbox Deployment Sprint/i)
if (retiredCombinedMatch) {
  fail('retired_product_label_found', { match: retiredCombinedMatch[0] })
}

const privateHtmlMatch = [home, products, contact]
  .join('\n')
  .match(/Yangon Tyre|YTF Portal|Plant A operations|ytf\.supermega\.dev/i)
if (privateHtmlMatch) {
  fail('private_client_copy_leak', { match: privateHtmlMatch[0] })
}

for (const shotPath of requiredProductShotPaths) {
  assertPng(shotPath)
}

console.log('[public-product-guard] current public product output verified')

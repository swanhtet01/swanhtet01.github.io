// Drift guard for docs/demo-playbooks/. Every backticked token in a playbook is
// a verbatim contract: it must exist in the app source (showroom/src), the
// public-site generator (tools/create_public_vercel_output.mjs), the site
// manifest, or package.json — or be derivable from a pattern that is itself
// pinned here (product-parameterised links the generator or app builds at
// runtime). If a route, query parameter, button label, or copy string drifts,
// this test fails and the playbook must be re-grounded.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const read = (path) => readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n')

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function collectSourceFiles(relativeDir, out) {
  for (const entry of readdirSync(resolve(root, relativeDir), { withFileTypes: true })) {
    const relativePath = `${relativeDir}/${entry.name}`
    if (entry.isDirectory()) collectSourceFiles(relativePath, out)
    else if (/\.(?:ts|tsx|css)$/.test(entry.name)) out.push(relativePath)
  }
  return out
}

const corpusPaths = [
  'tools/create_public_vercel_output.mjs',
  'site-manifest.json',
  'package.json',
  ...collectSourceFiles('showroom/src', []),
]
const corpus = corpusPaths.map(read).join('\n')
const manifest = JSON.parse(read('site-manifest.json'))
const generator = read('tools/create_public_vercel_output.mjs')
const productSetup = read('showroom/src/core/product-setup.ts')
const accountRoutes = read('showroom/src/core/account-routes.ts')

// Derived tokens: parameterised URLs and labels the sources build at runtime.
// Each derivation is guarded by the exact source pattern that produces it.
const derived = new Set()

check(manifest.release?.productionDomain === 'https://supermega.dev', 'manifest_production_domain')
check(generator.includes('href="/contact/?product=${escapeHtml(product.id)}"'), 'generator_contact_product_link_pattern')
check(generator.includes('https://app.supermega.dev/settings/?product=${encodeURIComponent(product.id)}'), 'generator_guided_sample_link_pattern')
// eslint-disable-next-line no-template-curly-in-string
check(generator.includes('Set up ${product.name} data'), 'generator_setup_label_pattern')
check(generator.includes('/contact/?product=guide&amp;source=managed-intelligence'), 'generator_managed_pilot_link')
derived.add('/contact/?product=guide&source=managed-intelligence')

check(productSetup.includes("utm_medium: 'guided_trial'")
  && productSetup.includes('return `https://supermega.dev/contact/?${query.toString()}`'), 'app_contact_url_builder_pattern')
check(productSetup.includes('/settings/?product=${encodeURIComponent(productContracts[product].slug)}'), 'app_guided_setup_path_pattern')
check(accountRoutes.includes("template: 'managed-account'"), 'account_contact_template_pattern')

for (const product of manifest.customerProducts) {
  check(product.appRoute === `https://app.supermega.dev/${product.id}/`, `manifest_app_route:${product.id}`)
  derived.add(`/contact/?product=${product.id}`)
  derived.add(`/settings/?product=${product.id}`)
  derived.add(`https://app.supermega.dev/settings/?product=${product.id}`)
  derived.add(`Set up ${product.name} data`)
  for (const template of product.templates ?? []) {
    derived.add(`https://supermega.dev/contact/?product=${product.id}&template=${template.id}&utm_source=app&utm_medium=guided_trial`)
  }
  derived.add(`https://supermega.dev/contact/?product=${product.id}&template=managed-account&utm_source=app&utm_medium=guided_trial`)
}
derived.add('https://supermega.dev/contact/?product=guide&template=managed-account&utm_source=app&utm_medium=guided_trial')

const origins = ['https://app.supermega.dev', 'https://supermega.dev']

function tokenOk(token) {
  if (derived.has(token) || corpus.includes(token)) return true
  for (const origin of origins) {
    if (token === origin) return true
    if (token.startsWith(origin)) {
      const rest = token.slice(origin.length)
      if (rest && (derived.has(rest) || corpus.includes(rest))) return true
    }
  }
  return false
}

const playbookDir = 'docs/demo-playbooks'
const files = readdirSync(resolve(root, playbookDir)).sort()
check(files.join(',') === 'README.md,ecommerce.md,plant.md,shop.md,website.md', `playbook_file_set:${files.join(',')}`)

const requiredSections = [
  '## 1. Client and the 30-second pitch',
  '## 2. Pre-demo setup',
  '## 3. Demo script',
  '## 4. Objection handling: the boundary',
  '## 5. The close',
]

for (const file of files) {
  const text = read(`${playbookDir}/${file}`)
  check(!text.includes('`Confirm change`'), `${file}:stale_generic_action_label`)
  const tokens = [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1])
  check(tokens.length >= 5, `${file}:token_floor:${tokens.length}`)
  for (const token of tokens) check(tokenOk(token), `${file}:unknown_token:${token}`)
  if (file === 'README.md') continue
  for (const section of requiredSections) check(text.includes(section), `${file}:section_missing:${section}`)
  const script = text.split('## 3. Demo script')[1]?.split('## 4.')[0] ?? ''
  const steps = script.split('\n').filter((line) => /^\d+\.\s/.test(line.trim()))
  check(steps.length >= 5 && steps.length <= 10, `${file}:demo_step_count:${steps.length}`)
}

const readme = read(`${playbookDir}/README.md`)
for (const name of ['shop.md', 'plant.md', 'website.md', 'ecommerce.md']) {
  check(readme.includes(name), `readme_indexes:${name}`)
}

console.log(JSON.stringify({ ok: true, contract: 'supermega_demo_playbooks', playbooks: files.length, checks }))

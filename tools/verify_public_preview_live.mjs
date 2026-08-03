import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const manifest = JSON.parse(await readFile(new URL('../site-manifest.json', import.meta.url), 'utf8'))
const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
const expectedCommit = String(process.env.EXPECTED_RELEASE_COMMIT || '').toLowerCase()
const vercelToken = String(process.env.VERCEL_TOKEN || '').trim()
const cliEnv = vercelToken ? { ...process.env, VERCEL_TOKEN: vercelToken } : process.env
const maxAttempts = 6
const retryWaitBuffer = new Int32Array(new SharedArrayBuffer(4))

if (!baseUrl.startsWith('https://')) throw new Error('public_preview_url_required')

function describeFailure(error) {
  const status = Number.isInteger(error?.status) ? error.status : 'unknown'
  let stderr = String(error?.stderr || '').trim()
  if (vercelToken) stderr = stderr.replaceAll(vercelToken, '[redacted]')
  stderr = stderr.replace(/([?&](?:token|secret|key)=)[^&\s]+/gi, '$1[redacted]')
  const lastLine = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1)
  return `exit=${status}${lastLine ? ` message=${lastLine.slice(0, 240)}` : ''}`
}

function get(path) {
  const npxArgs = ['--yes', 'vercel@56.1.0', 'curl', path, '--deployment', baseUrl]
  const executable = process.platform === 'win32' ? process.execPath : 'npx'
  const executableArgs = process.platform === 'win32'
    ? [resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'), ...npxArgs]
    : npxArgs
  let lastFailure = 'unknown'
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return execFileSync(executable, executableArgs, {
        encoding: 'utf8',
        env: cliEnv,
        maxBuffer: 8 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      lastFailure = describeFailure(error)
      if (attempt < maxAttempts) {
        console.error(`protected_preview_retry:${path}:attempt=${attempt}:${lastFailure}`)
        Atomics.wait(retryWaitBuffer, 0, 0, attempt * 2000)
      }
    }
  }
  throw new Error(`protected_preview_request_failed:${path}:attempts=${maxAttempts}:${lastFailure}`)
}

const renderedPages = new Map()
for (const page of manifest.pages) {
  const html = get(page.route)
  renderedPages.set(page.route, html)
  for (const token of [
    `meta name="supermega-brand-version" content="${manifest.brand.version}"`,
    `meta name="supermega-context-version" content="${manifest.contextVersion}"`,
    'aria-label="SuperMega home"',
  ]) {
    if (!html.includes(token)) throw new Error(`preview_shared_contract_missing:${page.route}:${token}`)
  }
  for (const retired of manifest.retiredPublicNames) {
    if (html.toLowerCase().includes(retired.toLowerCase())) throw new Error(`retired_context_preview:${page.route}:${retired}`)
  }
}

const homepage = renderedPages.get('/') || ''
for (const product of manifest.customerProducts) {
  const setupRoute = `https://app.supermega.dev/settings/?product=${encodeURIComponent(product.id)}`
  const productPage = renderedPages.get(product.publicAnchor) || ''
  const contactRoute = `/contact/?product=${product.id}&amp;source=product-page`
  if (!homepage.includes(`href="${product.publicAnchor}"`)) throw new Error(`preview_focused_product_page_missing:${product.id}`)
  if (homepage.includes(`href="${product.appRoute}"`)) throw new Error(`preview_homepage_bypasses_product_context:${product.id}`)
  if (!productPage.includes(`href="${product.appRoute}"`)) throw new Error(`preview_direct_product_route_missing:${product.id}`)
  if (!productPage.includes(`href="${contactRoute}"`)) throw new Error(`preview_product_contact_route_missing:${product.id}`)
  if (productPage.includes(`href="${setupRoute}"`)) throw new Error(`preview_product_setup_detour_returned:${product.id}`)
  for (const otherProduct of manifest.customerProducts.filter((candidate) => candidate.id !== product.id)) {
    if (productPage.includes(otherProduct.appRoute) || productPage.includes(`href="${otherProduct.publicAnchor}"`)) throw new Error(`preview_other_product_exposed:${product.id}:${otherProduct.id}`)
  }
}

const contactPage = renderedPages.get('/contact/') || ''
for (const token of [
  'Tell us your company and one recurring job that should become easier.',
  'type="hidden" name="template"',
  'Which job should become easier first?',
  'Request next step',
  "heading.textContent='Set up '+requestedProductName+' for your company.'",
  'You do not need to choose a template.',
]) {
  if (!contactPage.includes(token)) throw new Error(`preview_contact_onboarding_contract_missing:${token}`)
}
if (contactPage.includes('Template, if known')) throw new Error('preview_contact_template_decision_returned')

const release = JSON.parse(get(manifest.release.releaseEndpoint))
if (release.brandVersion !== manifest.brand.version) throw new Error('preview_brand_version_wrong')
if (release.contextVersion !== manifest.contextVersion) throw new Error('preview_context_version_wrong')
if (expectedCommit && release.commit !== expectedCommit) throw new Error(`preview_commit_wrong:${release.commit}`)

const contact = JSON.parse(get('/api/contact-submissions/status'))
if (contact.status !== 'ready' || contact.service !== 'supermega-contact' || contact.accepting !== true) throw new Error('preview_contact_not_accepting')
if (contact.controls?.idempotency !== 'required' || contact.controls?.edge_rate_limit !== 'required') throw new Error('preview_contact_controls_wrong')

const inspectArgs = ['--yes', 'vercel@56.1.0', 'inspect', baseUrl, '--format=json']
const inspectExecutable = process.platform === 'win32' ? process.execPath : 'npx'
const inspectExecutableArgs = process.platform === 'win32'
  ? [resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'), ...inspectArgs]
  : inspectArgs
let deploymentOutput
try {
  deploymentOutput = execFileSync(inspectExecutable, inspectExecutableArgs, {
    encoding: 'utf8',
    env: cliEnv,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (error) {
  throw new Error(`protected_preview_inspect_failed:${describeFailure(error)}`)
}
const deployment = JSON.parse(deploymentOutput)
const deploymentFunctions = (deployment.builds || [])
  .flatMap((build) => build.output || [])
  .filter((output) => output.type === 'lambda')
  .map((output) => output.path)
  .sort()
const expectedFunctions = ['api/contact-submissions.js', 'api/health.js', 'api/not-found.js']
if (JSON.stringify(deploymentFunctions) !== JSON.stringify(expectedFunctions)) throw new Error(`deployment_function_surface_wrong:${deploymentFunctions.join(',')}`)

console.log(JSON.stringify({ ok: true, contract: 'supermega_public_preview', baseUrl, pages: manifest.pages.map((page) => page.route), release, contact: 'ready', deploymentFunctions }, null, 2))

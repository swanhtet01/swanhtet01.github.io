import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { previewProfile, validatePreviewContact, validatePreviewLinks, validatePreviewDeployment } from './public_preview_profile.mjs'
import { validateShopBusinessTemplates } from '../showroom/src/products/shop/business-templates.ts'

const manifest = JSON.parse(await readFile(new URL('../site-manifest.json', import.meta.url), 'utf8'))
const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
const expectedCommit = String(process.env.EXPECTED_RELEASE_COMMIT || '').toLowerCase()
const policy = previewProfile({ profile: process.env.PUBLIC_PREVIEW_PROFILE || 'production-contract',
  expectedCommit, appBinding: process.env.SUPERMEGA_PREVIEW_APP_BINDING })
const vercelToken = String(process.env.VERCEL_TOKEN || '').trim()
const cliEnv = vercelToken ? { ...process.env, VERCEL_TOKEN: vercelToken } : process.env
const maxAttempts = 6
const linkOptions = { publicOrigin: baseUrl, shopTemplateIds: validateShopBusinessTemplates().map(item => item.id) }
const retryWaitBuffer = new Int32Array(new SharedArrayBuffer(4))

if (!baseUrl.startsWith('https://')) throw new Error('public_preview_url_required')
if (policy.app && (!/^https:\/\/supermega-public-[a-z0-9]{9}-swanhtet01s-projects\.vercel\.app$/.test(baseUrl)
  || !/^dpl_[A-Za-z0-9]{8,80}$/.test(process.env.PUBLIC_PREVIEW_DEPLOYMENT_ID || ''))) throw new Error('public_preview_identity_required')

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

for (const page of manifest.pages) {
  const html = get(page.route)
  validatePreviewLinks(html, policy, manifest.customerProducts, { ...linkOptions, requireActions: false })
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

const homepage = get('/')
const navigation = validatePreviewLinks(homepage, policy, manifest.customerProducts, linkOptions)

const release = JSON.parse(get(manifest.release.releaseEndpoint))
if (release.brandVersion !== manifest.brand.version) throw new Error('preview_brand_version_wrong')
if (release.contextVersion !== manifest.contextVersion) throw new Error('preview_context_version_wrong')
if (expectedCommit && release.commit !== expectedCommit) throw new Error(`preview_commit_wrong:${release.commit}`)

const contact = JSON.parse(get('/api/contact-submissions/status'))
validatePreviewContact(contact, policy)

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
if (policy.app) {
  validatePreviewDeployment(deployment, { origin: baseUrl, projectId: 'prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR',
    deploymentId: process.env.PUBLIC_PREVIEW_DEPLOYMENT_ID, commit: expectedCommit })
  const appArgs = [...inspectExecutableArgs]
  appArgs[appArgs.indexOf(baseUrl)] = policy.app.origin
  let appDeployment
  try {
    appDeployment = JSON.parse(execFileSync(inspectExecutable, appArgs, {
      encoding: 'utf8', env: cliEnv, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    }))
  } catch (error) { throw new Error(`protected_preview_app_inspect_failed:${describeFailure(error)}`) }
  validatePreviewDeployment(appDeployment, policy.app)
}
const deploymentFunctions = (deployment.builds || [])
  .flatMap((build) => build.output || [])
  .filter((output) => output.type === 'lambda')
  .map((output) => output.path)
  .sort()
const expectedFunctions = ['api/contact-submissions.js', 'api/health.js', 'api/not-found.js']
if (JSON.stringify(deploymentFunctions) !== JSON.stringify(expectedFunctions)) throw new Error(`deployment_function_surface_wrong:${deploymentFunctions.join(',')}`)

console.log(JSON.stringify({ ok: true, contract: 'supermega_public_preview.v2', profile: policy.profile, baseUrl,
  pages: manifest.pages.map((page) => page.route), release, contact: contact.status, navigation, deploymentFunctions,
  browserTransitionProven: false, environmentIsolationProven: false, hostedCustomerAcceptanceProven: false }, null, 2))

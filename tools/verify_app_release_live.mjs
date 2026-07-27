import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const manifest = JSON.parse(await readFile(new URL('../site-manifest.json', import.meta.url), 'utf8'))
const baseUrl = String(process.env.APP_BASE_URL || 'https://app.supermega.dev').replace(/\/$/, '')
const expectedCommit = String(process.env.EXPECTED_RELEASE_COMMIT || '').trim().toLowerCase()
const protectedPreview = process.env.VERCEL_PROTECTED_PREVIEW === '1'
const vercelToken = String(process.env.VERCEL_TOKEN || '').trim()
const cliEnv = vercelToken ? { ...process.env, VERCEL_TOKEN: vercelToken } : process.env
const canonicalProductRoutes = ['/shop/', '/plant/', '/website/', '/ecommerce/']
const routes = ['/', '/work/', '/operations/', ...canonicalProductRoutes, '/operations/commerce/', '/operations/production/', '/products/website/', '/products/ecommerce/', '/agents/', '/settings/']

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function describeCliFailure(error) {
  const status = Number.isInteger(error?.status) ? error.status : 'unknown'
  let stderr = String(error?.stderr || '').trim()
  if (vercelToken) stderr = stderr.replaceAll(vercelToken, '[redacted]')
  stderr = stderr.replace(/([?&](?:token|secret|key)=)[^&\s]+/gi, '$1[redacted]')
  const lines = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-3)
  return `exit=${status}${lines.length ? ` message=${lines.join(' | ').slice(0, 480)}` : ''}`
}

async function get(path, attempts = 7) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (protectedPreview) {
        const npxArgs = ['--yes', 'vercel@56.1.0', 'curl', path, '--deployment', baseUrl]
        const executable = process.platform === 'win32' ? process.execPath : 'npx'
        const executableArgs = process.platform === 'win32'
          ? [resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'), ...npxArgs]
          : npxArgs
        const body = execFileSync(executable, executableArgs, {
          encoding: 'utf8',
          env: cliEnv,
          maxBuffer: 8 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        return { response: null, body }
      }
      const response = await fetch(`${baseUrl}${path}`, { headers: { accept: path.endsWith('.json') ? 'application/json' : 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(15000) })
      if (!response.ok) throw new Error(`${path}:${response.status}`)
      return { response, body: await response.text() }
    } catch (error) {
      if (protectedPreview) {
        lastError = new Error(`protected_preview_request_failed:${path}:${describeCliFailure(error)}`)
      } else {
        lastError = error
      }
      if (attempt < attempts) await sleep(attempt * 1800)
    }
  }
  throw lastError
}

const pages = new Map()
for (const route of routes) {
  const result = await get(route)
  pages.set(route, result.body)
  if (!protectedPreview && result.response && canonicalProductRoutes.includes(route)) {
    const finalPath = new URL(result.response.url).pathname
    if (finalPath !== route) throw new Error(`canonical_product_route_redirected:${route}:${finalPath}`)
  }
}
for (const [route, html] of pages) {
  if (!html.includes('<title>SuperMega</title>')) throw new Error(`wrong_shell:${route}`)
}

const release = JSON.parse((await get('/__release.json')).body)
if (release.service !== 'supermega-app') throw new Error('wrong_release_service')
if (release.canonicalDomain !== 'https://app.supermega.dev') throw new Error('wrong_release_domain')
if (release.brandVersion !== manifest.brand.version) throw new Error(`release_brand_version_mismatch:${release.brandVersion}`)
if (release.contextVersion !== manifest.contextVersion) throw new Error(`release_context_version_mismatch:${release.contextVersion}`)
if (release.catalogVersion !== manifest.catalogVersion) throw new Error(`release_catalog_version_mismatch:${release.catalogVersion}`)
if (expectedCommit && String(release.commit || '').toLowerCase() !== expectedCommit) throw new Error(`release_commit_mismatch:${release.commit}`)

const health = JSON.parse((await get('/api/health')).body)
if (health.status !== 'ready' || health.service !== 'supermega-service') throw new Error('canonical_api_unavailable')
if (!['isolated_demo', 'managed_trial'].includes(health.operating_mode)) throw new Error('unknown_operating_mode')
if (health.trial_backend?.browser_service_role_exposed !== false) throw new Error('unsafe_browser_service_role_contract')
if (typeof health.trial_backend?.role_ready !== 'boolean') throw new Error('runtime_database_role_contract_missing')
if (health.operating_mode === 'managed_trial' && (health.enterprise_db_ready !== true || health.security_ready !== true)) throw new Error('managed_trial_readiness_mismatch')
if (health.operating_mode === 'managed_trial' && health.trial_backend.role_ready !== true) throw new Error('managed_trial_runtime_role_unsafe')

const cloud = JSON.parse((await get('/api/cloud-autonomy/status')).body)
if (!['ready', 'degraded'].includes(cloud.status) || cloud.runtime_target !== 'hosted_vercel_api' || cloud.pc_dependency !== false) throw new Error('hosted_agent_runtime_contract_wrong')
if (JSON.stringify(cloud.scheduler?.queue_job_types) !== JSON.stringify(['task_triage', 'ops_watch'])) throw new Error('hosted_agent_queue_jobs_wrong')
if (JSON.stringify(cloud.scheduler?.daily_job_types) !== JSON.stringify(['founder_brief', 'github_release_watch'])) throw new Error('hosted_agent_daily_jobs_wrong')
if (cloud.scheduler?.redirects_allowed !== false) throw new Error('hosted_agent_redirect_policy_wrong')
if (cloud.scheduler?.activation_required !== true || cloud.scheduler?.activation_environment_key !== 'SUPERMEGA_HOSTED_SCHEDULER_ENABLED') throw new Error('hosted_agent_activation_contract_wrong')
if (cloud.status === 'ready' && cloud.scheduler?.configured !== true) throw new Error('hosted_agent_readiness_mismatch')
if (cloud.status === 'ready' && cloud.scheduler?.activation_enabled !== true) throw new Error('hosted_agent_activation_mismatch')

const rootHtml = pages.get('/')
const scriptPaths = [...rootHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1])
const cssPaths = [...rootHtml.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((match) => match[1])
const assetCorpus = (await Promise.all([...scriptPaths, ...cssPaths].map(async (path) => (await get(path)).body))).join('\n')
for (const required of ['SUPERMEGA', 'What do you want to run?', 'Shop', 'Plant', 'Website', 'Ecommerce', 'Sample workspace', manifest.brand.colors.accent, manifest.brand.colors.ink]) {
  if (!assetCorpus.includes(required)) throw new Error(`missing_live_context:${required}`)
}
for (const forbidden of ['SuperMega HQ', 'One next action for the company', 'Agents prepare work', 'pos.supermega.dev', 'ytf.supermega.dev', 'Yangon Tyre', 'ytf-plant-a']) {
  if (assetCorpus.toLowerCase().includes(forbidden.toLowerCase())) throw new Error(`retired_live_context:${forbidden}`)
}

let deploymentFunctions = null
if (protectedPreview) {
  const npxArgs = ['--yes', 'vercel@56.1.0', 'inspect', baseUrl, '--format=json']
  const executable = process.platform === 'win32' ? process.execPath : 'npx'
  const executableArgs = process.platform === 'win32'
    ? [resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'), ...npxArgs]
    : npxArgs
  let deploymentOutput
  try {
    deploymentOutput = execFileSync(executable, executableArgs, {
      encoding: 'utf8',
      env: cliEnv,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    throw new Error(`protected_preview_inspect_failed:${describeCliFailure(error)}`)
  }
  const deployment = JSON.parse(deploymentOutput)
  deploymentFunctions = (deployment.builds || [])
    .flatMap((build) => build.output || [])
    .filter((output) => output.type === 'lambda')
    .map((output) => output.path)
    .sort()
  if (JSON.stringify(deploymentFunctions) !== JSON.stringify(['api/app'])) throw new Error(`deployment_function_surface_wrong:${deploymentFunctions.join(',')}`)
}

console.log(JSON.stringify({ ok: true, contract: 'supermega_app_live', baseUrl, routes, release, operatingMode: health.operating_mode, agentScheduler: cloud.status, deploymentFunctions }, null, 2))

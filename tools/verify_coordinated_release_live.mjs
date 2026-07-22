import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const manifest = JSON.parse(await readFile(new URL('../site-manifest.json', import.meta.url), 'utf8'))
const identityFields = ['commit', 'brandVersion', 'contextVersion', 'catalogVersion']

function assert(condition, code, detail = {}) {
  if (!condition) throw new Error(`${code}:${JSON.stringify(detail)}`)
}

function releaseIdentity(release) {
  return Object.fromEntries(identityFields.map((field) => [field, String(release?.[field] || '').trim()]))
}

function verifyReleasePair(appRelease, publicRelease, { expectedCommit = '', pairOnly = false } = {}) {
  assert(appRelease?.service === 'supermega-app', 'app_release_service_wrong')
  assert(appRelease?.canonicalDomain === 'https://app.supermega.dev', 'app_release_domain_wrong')
  assert(publicRelease?.service === 'supermega-public-site', 'public_release_service_wrong')

  const app = releaseIdentity(appRelease)
  const publicSite = releaseIdentity(publicRelease)
  for (const field of identityFields) {
    assert(app[field], 'app_release_identity_missing', { field })
    assert(publicSite[field], 'public_release_identity_missing', { field })
    assert(app[field] === publicSite[field], 'cross_domain_release_identity_mismatch', {
      field,
      app: app[field],
      public: publicSite[field],
    })
  }
  assert(/^[0-9a-f]{40}$/.test(app.commit), 'release_commit_not_immutable', { commit: app.commit })

  if (expectedCommit) {
    assert(app.commit === expectedCommit.toLowerCase(), 'release_commit_wrong', {
      expected: expectedCommit.toLowerCase(),
      actual: app.commit,
    })
  }
  if (!pairOnly) {
    const expected = {
      brandVersion: manifest.brand.version,
      contextVersion: manifest.contextVersion,
      catalogVersion: manifest.catalogVersion,
    }
    for (const [field, value] of Object.entries(expected)) {
      assert(app[field] === value, 'release_manifest_identity_mismatch', {
        field,
        expected: value,
        actual: app[field],
      })
    }
  }
  return app
}

function expectRejected(name, callback) {
  try {
    callback()
  } catch {
    return [name, true]
  }
  return [name, false]
}

if (process.argv.includes('--self-test')) {
  const commit = 'a'.repeat(40)
  const identity = {
    commit,
    brandVersion: manifest.brand.version,
    contextVersion: manifest.contextVersion,
    catalogVersion: manifest.catalogVersion,
  }
  const app = {
    service: 'supermega-app',
    canonicalDomain: 'https://app.supermega.dev',
    ...identity,
  }
  const publicSite = { service: 'supermega-public-site', ...identity }
  const checks = Object.fromEntries([
    ['matching_pair', releaseIdentity(verifyReleasePair(app, publicSite, { expectedCommit: commit })).commit === commit],
    expectRejected('reject_commit_drift', () => verifyReleasePair(app, { ...publicSite, commit: 'b'.repeat(40) })),
    expectRejected('reject_brand_drift', () => verifyReleasePair(app, { ...publicSite, brandVersion: 'stale-brand' })),
    expectRejected('reject_context_drift', () => verifyReleasePair(app, { ...publicSite, contextVersion: 'stale-context' })),
    expectRejected('reject_catalog_drift', () => verifyReleasePair(app, { ...publicSite, catalogVersion: 'stale-catalog' })),
    expectRejected('reject_wrong_app_domain', () => verifyReleasePair({ ...app, canonicalDomain: 'https://example.invalid' }, publicSite)),
  ])
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
  console.log(JSON.stringify({
    ok: failed.length === 0,
    contract: 'supermega_coordinated_release_self_test',
    checks,
    failedChecks: failed,
  }, null, 2))
  process.exit(failed.length === 0 ? 0 : 1)
}

const appBaseUrl = String(process.env.APP_BASE_URL || 'https://app.supermega.dev').replace(/\/$/, '')
const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || manifest.release.productionDomain).replace(/\/$/, '')
const expectedCommit = String(process.env.EXPECTED_RELEASE_COMMIT || '').trim().toLowerCase()
const pairOnly = process.env.VERIFY_RELEASE_PAIR_ONLY === '1'
const protectedPreview = process.env.VERCEL_PROTECTED_PREVIEW === '1'
const vercelToken = String(process.env.VERCEL_TOKEN || '').trim()
const appVercelProjectId = String(process.env.APP_VERCEL_PROJECT_ID || '').trim()
const publicVercelProjectId = String(process.env.PUBLIC_VERCEL_PROJECT_ID || '').trim()
const attempts = Number(process.env.RELEASE_BARRIER_ATTEMPTS || 7)
const retryDelayMs = Number(process.env.RELEASE_BARRIER_RETRY_MS || 3000)
const timeoutMs = Number(process.env.RELEASE_BARRIER_TIMEOUT_MS || 15000)
const cliEnv = vercelToken ? { ...process.env, VERCEL_TOKEN: vercelToken } : process.env

assert(appBaseUrl.startsWith('https://'), 'app_release_url_required')
assert(publicBaseUrl.startsWith('https://'), 'public_release_url_required')
if (protectedPreview) assert(vercelToken, 'protected_preview_token_required')
if (protectedPreview) assert(appVercelProjectId, 'app_vercel_project_id_required')
if (protectedPreview) assert(publicVercelProjectId, 'public_vercel_project_id_required')

function describeCliFailure(error) {
  const status = Number.isInteger(error?.status) ? error.status : 'unknown'
  let stderr = String(error?.stderr || '').trim()
  if (vercelToken) stderr = stderr.replaceAll(vercelToken, '[redacted]')
  stderr = stderr.replace(/([?&](?:token|secret|key)=)[^&\s]+/gi, '$1[redacted]')
  const lines = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-3)
  return `exit=${status}${lines.length ? ` message=${lines.join(' | ').slice(0, 480)}` : ''}`
}

function readProtectedRelease(baseUrl, projectId) {
  const npxArgs = ['--yes', 'vercel@56.1.0', 'curl', '/__release.json', '--deployment', baseUrl, '--yes']
  const executable = process.platform === 'win32' ? process.execPath : 'npx'
  const executableArgs = process.platform === 'win32'
    ? [resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'), ...npxArgs]
    : npxArgs
  try {
    return JSON.parse(execFileSync(executable, executableArgs, {
      encoding: 'utf8',
      env: { ...cliEnv, VERCEL_PROJECT_ID: projectId },
      maxBuffer: 2 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }))
  } catch (error) {
    throw new Error(`protected_release_request_failed:${describeCliFailure(error)}`)
  }
}

async function readPublicRelease(baseUrl) {
  const response = await fetch(new URL('/__release.json', `${baseUrl}/`), {
    cache: 'no-store',
    redirect: 'follow',
    headers: {
      accept: 'application/json',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'user-agent': 'SuperMegaCoordinatedRelease/1.0',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  assert(response.status === 200, 'release_endpoint_http_error', { baseUrl, status: response.status })
  return response.json()
}

async function readRelease(baseUrl, projectId) {
  return protectedPreview ? readProtectedRelease(baseUrl, projectId) : readPublicRelease(baseUrl)
}

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds))
let lastError
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const [appRelease, publicRelease] = await Promise.all([
      readRelease(appBaseUrl, appVercelProjectId),
      readRelease(publicBaseUrl, publicVercelProjectId),
    ])
    const identity = verifyReleasePair(appRelease, publicRelease, { expectedCommit, pairOnly })
    console.log(JSON.stringify({
      ok: true,
      contract: 'supermega_coordinated_release',
      attempt,
      appBaseUrl,
      publicBaseUrl,
      pairOnly,
      identity,
    }, null, 2))
    process.exit(0)
  } catch (error) {
    lastError = error
    if (attempt < attempts) await sleep(attempt * retryDelayMs)
  }
}

console.error(JSON.stringify({
  ok: false,
  contract: 'supermega_coordinated_release',
  appBaseUrl,
  publicBaseUrl,
  pairOnly,
  reason: lastError?.message || 'unknown_failure',
}, null, 2))
process.exit(1)

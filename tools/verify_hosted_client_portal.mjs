import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CONTRACT = 'supermega.hosted_client_portal_smoke.v1'
const PRODUCT_ORDER = ['commerce', 'production', 'website', 'ecommerce']
const PRODUCT_ALIASES = new Map([['shop', 'commerce'], ['plant', 'production']])
const PRODUCT_SURFACE = new Map([
  ['commerce', 'commerce'],
  ['production', 'production'],
  ['website', 'website'],
  ['ecommerce', 'commerce'],
])
const PRODUCT_CAPABILITY = new Map([
  ['commerce', 'commerce.write'],
  ['production', 'production.write'],
  ['website', 'website.write'],
  ['ecommerce', 'commerce.write'],
])

function fail(code, detail = {}) {
  throw new Error(`${code}:${JSON.stringify(detail)}`)
}

function assert(condition, code, detail = {}) {
  if (!condition) fail(code, detail)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(String(value), 'utf8').digest('hex')}`
}

function canonicalProducts(value) {
  const requested = String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
  assert(requested.length > 0, 'expected_products_required')
  const normalized = requested.map((item) => PRODUCT_ALIASES.get(item) || item)
  assert(normalized.every((item) => PRODUCT_ORDER.includes(item)), 'expected_products_invalid')
  assert(new Set(normalized).size === normalized.length, 'expected_products_duplicate')
  return PRODUCT_ORDER.filter((item) => normalized.includes(item))
}

function safeBaseUrl(value, allowHttp = false) {
  const url = new URL(String(value || 'https://app.supermega.dev'))
  assert((url.protocol === 'https:' || allowHttp) && !url.username && !url.password && !url.search && !url.hash, 'base_url_unsafe')
  assert(url.pathname === '/' || url.pathname === '', 'base_url_path_forbidden')
  return url.href.replace(/\/$/, '')
}

function validateIdentifier(value, code) {
  const normalized = String(value || '').trim()
  assert(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(normalized), code)
  return normalized
}

function validateToken(value, code) {
  const token = String(value || '').trim()
  assert(token.length >= 20 && token.length <= 16384 && !/\s/.test(token), code)
  return token
}

async function readJsonResponse(response, code) {
  const contentType = response.headers.get('content-type') || ''
  assert(/application\/json/i.test(contentType), `${code}_content_type`, { status: response.status })
  const raw = await response.text()
  assert(raw.length > 0 && raw.length <= 1024 * 1024, `${code}_body_size`, { status: response.status })
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    fail(`${code}_invalid_json`, { status: response.status })
  }
  return { body, digest: sha256(raw) }
}

async function requestJson(fetchImpl, baseUrl, path, { token = '', workspaceId = '' } = {}) {
  const headers = {
    accept: 'application/json',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    'user-agent': 'SuperMegaHostedPortalSmoke/1.0',
  }
  if (token) headers.authorization = `Bearer ${token}`
  if (workspaceId) headers['x-supermega-workspace-id'] = workspaceId
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method: 'GET',
    headers,
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  })
  return { response, ...(await readJsonResponse(response, path.replace(/\W+/g, '_')))}
}

function verifyDirectory(body, expectedWorkspaceId, expectedAccess, code) {
  assert(isRecord(body)
    && body.contract === 'supermega.managed_workspace_directory.v1'
    && body.status === 'ready'
    && body.external_writes_performed === false
    && body.secret_values_exposed === false
    && Array.isArray(body.workspaces)
    && body.workspaces.length <= 50, `${code}_contract_invalid`)
  const ids = []
  for (const entry of body.workspaces) {
    assert(isRecord(entry)
      && typeof entry.workspace_id === 'string'
      && typeof entry.label === 'string'
      && entry.label.trim().length > 0
      && ['owner', 'operator', 'viewer'].includes(entry.access), `${code}_entry_invalid`)
    ids.push(entry.workspace_id)
  }
  assert(new Set(ids).size === ids.length, `${code}_duplicates`)
  const matching = body.workspaces.filter((entry) => entry.workspace_id === expectedWorkspaceId)
  if (expectedAccess) {
    assert(matching.length === 1 && matching[0].access === expectedAccess, `${code}_expected_workspace_missing`)
  } else {
    assert(matching.length === 0, `${code}_cross_tenant_workspace_visible`)
  }
  return body.workspaces.length
}

function verifyOwnerBootstrap(body, expectedWorkspaceId, expectedOwnerId, expectedProducts) {
  assert(isRecord(body) && isRecord(body.identity) && isRecord(body.readiness)
    && isRecord(body.states) && Array.isArray(body.approvals), 'owner_bootstrap_contract_invalid')
  assert(body.identity.workspace_id === expectedWorkspaceId
    && body.identity.actor_id === expectedOwnerId
    && body.identity.actor_kind === 'human', 'owner_bootstrap_identity_mismatch')
  const readiness = body.readiness
  const requiredChecks = ['database_ready', 'role_ready', 'schema_ready', 'auth_ready', 'membership_ready', 'audit_ready', 'write_enabled']
  assert(readiness.backend === 'postgres'
    && readiness.read_ready === true
    && readiness.write_ready === true
    && readiness.status === 'ready'
    && isRecord(readiness.checks)
    && requiredChecks.every((check) => readiness.checks[check] === true), 'owner_bootstrap_not_write_ready')
  assert(Array.isArray(readiness.productEntitlements)
    && JSON.stringify(readiness.productEntitlements) === JSON.stringify(expectedProducts), 'owner_product_entitlements_mismatch', {
    expectedProducts,
    actualProducts: Array.isArray(readiness.productEntitlements) ? readiness.productEntitlements : null,
  })
  assert(Array.isArray(readiness.capabilities)
    && readiness.capabilities.every((capability) => typeof capability === 'string')
    && new Set(readiness.capabilities).size === readiness.capabilities.length, 'owner_capabilities_invalid')
  const entitledSurfaces = new Set(expectedProducts.map((product) => PRODUCT_SURFACE.get(product)))
  for (const surface of entitledSurfaces) assert(isRecord(body.states[surface]), 'owner_entitled_surface_missing', { surface })
  for (const product of PRODUCT_ORDER) {
    const capability = PRODUCT_CAPABILITY.get(product)
    if (!expectedProducts.includes(product)
      && !expectedProducts.some((candidate) => PRODUCT_CAPABILITY.get(candidate) === capability)) {
      assert(!readiness.capabilities.includes(capability), 'owner_unentitled_capability_present', { capability })
    }
  }
  return {
    capabilities: [...readiness.capabilities].sort(),
    stateSurfaces: Object.keys(body.states).sort(),
    approvalCount: body.approvals.length,
  }
}

function verifyPrivateResponseHeaders(response, code) {
  assert(/\bno-store\b/i.test(response.headers.get('cache-control') || ''), `${code}_cacheable`)
  assert((response.headers.get('x-content-type-options') || '').toLowerCase() === 'nosniff', `${code}_nosniff_missing`)
}

export async function verifyHostedClientPortal({
  baseUrl,
  expectedCommit,
  expectedProducts,
  expectedWorkspaceId,
  expectedOwnerId,
  ownerToken,
  deniedToken,
  fetchImpl = fetch,
  allowHttp = false,
  capturedAt = new Date().toISOString(),
}) {
  const origin = safeBaseUrl(baseUrl, allowHttp)
  const releaseCommit = String(expectedCommit || '').trim().toLowerCase()
  assert(/^[0-9a-f]{40}$/.test(releaseCommit), 'expected_release_commit_invalid')
  const products = Array.isArray(expectedProducts) ? canonicalProducts(expectedProducts.join(',')) : canonicalProducts(expectedProducts)
  const workspaceId = validateIdentifier(expectedWorkspaceId, 'expected_workspace_id_invalid')
  const ownerId = validateIdentifier(expectedOwnerId, 'expected_owner_id_invalid')
  const ownerAccessToken = validateToken(ownerToken, 'owner_access_token_invalid')
  const deniedAccessToken = validateToken(deniedToken, 'denied_access_token_invalid')
  assert(ownerAccessToken !== deniedAccessToken, 'independent_principals_required')

  const releaseResult = await requestJson(fetchImpl, origin, '/__release.json')
  assert(releaseResult.response.status === 200, 'release_http_error', { status: releaseResult.response.status })
  const release = releaseResult.body
  assert(isRecord(release)
    && release.service === 'supermega-app'
    && release.canonicalDomain === 'https://app.supermega.dev'
    && String(release.commit || '').toLowerCase() === releaseCommit, 'release_identity_mismatch', {
    expectedCommit: releaseCommit,
    actualCommit: String(release?.commit || '').toLowerCase() || null,
  })

  const healthResult = await requestJson(fetchImpl, origin, '/api/health')
  assert(healthResult.response.status === 200, 'health_http_error', { status: healthResult.response.status })
  const health = healthResult.body
  assert(isRecord(health)
    && health.status === 'ready'
    && health.service === 'supermega-service'
    && health.operating_mode === 'managed_trial'
    && health.enterprise_db_ready === true
    && health.security_ready === true
    && health.authentication?.supabase_user_tokens_ready === true
    && health.authentication?.anonymous_users_allowed === false
    && health.trial_backend?.database_ready === true
    && health.trial_backend?.role_ready === true
    && health.trial_backend?.schema_ready === true
    && health.trial_backend?.audit_ready === true
    && health.trial_backend?.write_enabled === true
    && health.trial_backend?.browser_service_role_exposed === false, 'managed_runtime_not_ready')

  const ownerDirectoryResult = await requestJson(fetchImpl, origin, '/api/trial/v1/workspaces', { token: ownerAccessToken })
  assert(ownerDirectoryResult.response.status === 200, 'owner_directory_http_error', { status: ownerDirectoryResult.response.status })
  verifyPrivateResponseHeaders(ownerDirectoryResult.response, 'owner_directory')
  const ownerWorkspaceCount = verifyDirectory(ownerDirectoryResult.body, workspaceId, 'owner', 'owner_directory')

  const ownerBootstrapResult = await requestJson(fetchImpl, origin, '/api/trial/v1/bootstrap', {
    token: ownerAccessToken,
    workspaceId,
  })
  assert(ownerBootstrapResult.response.status === 200, 'owner_bootstrap_http_error', { status: ownerBootstrapResult.response.status })
  verifyPrivateResponseHeaders(ownerBootstrapResult.response, 'owner_bootstrap')
  const ownerPortal = verifyOwnerBootstrap(ownerBootstrapResult.body, workspaceId, ownerId, products)

  const deniedDirectoryResult = await requestJson(fetchImpl, origin, '/api/trial/v1/workspaces', { token: deniedAccessToken })
  assert(deniedDirectoryResult.response.status === 200, 'denied_principal_directory_http_error', { status: deniedDirectoryResult.response.status })
  verifyPrivateResponseHeaders(deniedDirectoryResult.response, 'denied_principal_directory')
  const deniedWorkspaceCount = verifyDirectory(deniedDirectoryResult.body, workspaceId, null, 'denied_principal_directory')

  const deniedBootstrapResult = await requestJson(fetchImpl, origin, '/api/trial/v1/bootstrap', {
    token: deniedAccessToken,
    workspaceId,
  })
  assert(deniedBootstrapResult.response.status === 403, 'cross_tenant_bootstrap_not_denied', { status: deniedBootstrapResult.response.status })
  verifyPrivateResponseHeaders(deniedBootstrapResult.response, 'cross_tenant_denial')
  assert(deniedBootstrapResult.body?.detail?.code === 'trial_membership_required', 'cross_tenant_denial_contract_wrong')

  return {
    contract: CONTRACT,
    status: 'passed',
    capturedAt,
    target: {
      baseUrl: origin,
      exactReleaseCommit: releaseCommit,
      workspaceDigest: sha256(workspaceId),
      ownerDigest: sha256(ownerId),
      expectedProducts: products,
    },
    release: {
      service: release.service,
      canonicalDomain: release.canonicalDomain,
      exactCommitMatched: true,
      responseDigest: releaseResult.digest,
    },
    runtime: {
      service: health.service,
      operatingMode: health.operating_mode,
      managedDatabaseReady: true,
      namedUserAuthReady: true,
      writesEnabled: true,
      responseDigest: healthResult.digest,
    },
    ownerPortal: {
      namedOwnerVerified: true,
      ownerWorkspaceVisible: true,
      access: 'owner',
      workspaceCount: ownerWorkspaceCount,
      readReady: true,
      writeReady: true,
      productEntitlements: products,
      capabilities: ownerPortal.capabilities,
      stateSurfaces: ownerPortal.stateSurfaces,
      approvalCount: ownerPortal.approvalCount,
      directoryResponseDigest: ownerDirectoryResult.digest,
      bootstrapResponseDigest: ownerBootstrapResult.digest,
    },
    crossTenant: {
      independentNamedPrincipalVerified: true,
      ownerWorkspaceAbsentFromDirectory: true,
      unrelatedWorkspaceCount: deniedWorkspaceCount,
      ownerWorkspaceBootstrapDenied: true,
      denialStatus: 403,
      denialCode: 'trial_membership_required',
      directoryResponseDigest: deniedDirectoryResult.digest,
      denialResponseDigest: deniedBootstrapResult.digest,
    },
    boundaries: {
      requestsPerformed: 'six HTTPS GET requests',
      tenantWritesPerformed: false,
      deploymentPerformed: false,
      credentialsPersisted: false,
      clientIdentifiersPersisted: false,
      secretValuesExposed: false,
    },
  }
}

function currentHead() {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim().toLowerCase()
  assert(/^[0-9a-f]{40}$/.test(commit), 'current_head_commit_unavailable')
  return commit
}

async function readRequiredFile(pathValue, code) {
  const path = String(pathValue || '').trim()
  assert(path, code)
  return (await readFile(resolve(path), 'utf8')).trim()
}

function mockFetch({ crossTenantStatus = 403 } = {}) {
  const commit = 'a'.repeat(40)
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
  return async (url, init) => {
    const path = new URL(url).pathname
    const auth = init.headers.authorization
    if (path === '/__release.json') return json({ service: 'supermega-app', canonicalDomain: 'https://app.supermega.dev', commit })
    if (path === '/api/health') return json({
      status: 'ready', service: 'supermega-service', operating_mode: 'managed_trial', enterprise_db_ready: true, security_ready: true,
      authentication: { supabase_user_tokens_ready: true, anonymous_users_allowed: false },
      trial_backend: { database_ready: true, role_ready: true, schema_ready: true, audit_ready: true, write_enabled: true, browser_service_role_exposed: false },
    })
    if (path === '/api/trial/v1/workspaces') return auth.includes('owner-token')
      ? json({ contract: 'supermega.managed_workspace_directory.v1', status: 'ready', workspaces: [{ workspace_id: 'workspace-owner', label: 'Owner company', access: 'owner' }], external_writes_performed: false, secret_values_exposed: false })
      : json({ contract: 'supermega.managed_workspace_directory.v1', status: 'ready', workspaces: [{ workspace_id: 'workspace-other', label: 'Other company', access: 'owner' }], external_writes_performed: false, secret_values_exposed: false })
    if (path === '/api/trial/v1/bootstrap' && auth.includes('owner-token')) return json({
      identity: { workspace_id: 'workspace-owner', actor_id: 'owner-actor', actor_kind: 'human' },
      readiness: { status: 'ready', backend: 'postgres', read_ready: true, write_ready: true, checks: { database_ready: true, role_ready: true, schema_ready: true, auth_ready: true, membership_ready: true, audit_ready: true, write_enabled: true }, capabilities: ['commerce.write', 'website.write'], productEntitlements: ['commerce', 'website'] },
      states: { commerce: {}, website: {} }, approvals: [],
    })
    if (path === '/api/trial/v1/bootstrap') return crossTenantStatus === 403
      ? json({ detail: { code: 'trial_membership_required' } }, 403)
      : json({ identity: { workspace_id: 'workspace-owner', actor_id: 'other-actor', actor_kind: 'human' }, readiness: {}, states: {}, approvals: [] }, crossTenantStatus)
    return json({ detail: { code: 'not_found' } }, 404)
  }
}

async function selfTest() {
  const input = {
    baseUrl: 'http://127.0.0.1:4173', allowHttp: true, expectedCommit: 'a'.repeat(40),
    expectedProducts: 'shop,website', expectedWorkspaceId: 'workspace-owner', expectedOwnerId: 'owner-actor',
    ownerToken: 'owner-token-1234567890', deniedToken: 'denied-token-123456789', capturedAt: '2026-08-22T00:00:00.000Z',
  }
  const evidence = await verifyHostedClientPortal({ ...input, fetchImpl: mockFetch() })
  const rendered = JSON.stringify(evidence)
  assert(evidence.status === 'passed' && evidence.target.expectedProducts.join(',') === 'commerce,website', 'self_test_positive_failed')
  for (const forbidden of [input.ownerToken, input.deniedToken, input.expectedWorkspaceId, input.expectedOwnerId]) {
    assert(!rendered.includes(forbidden), 'self_test_sensitive_value_persisted')
  }
  let denied = false
  try {
    await verifyHostedClientPortal({ ...input, fetchImpl: mockFetch({ crossTenantStatus: 200 }) })
  } catch (error) {
    denied = String(error?.message || '').startsWith('cross_tenant_bootstrap_not_denied:')
  }
  assert(denied, 'self_test_cross_tenant_leak_accepted')
  console.log(JSON.stringify({ ok: true, contract: `${CONTRACT}.self_test`, checks: 6 }, null, 2))
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest()
  const expectedCommit = process.argv.includes('--current-head')
    ? currentHead()
    : String(process.env.EXPECTED_RELEASE_COMMIT || '').trim()
  const [expectedWorkspaceId, expectedOwnerId, ownerToken, deniedToken] = await Promise.all([
    readRequiredFile(process.env.SUPERMEGA_EXPECTED_WORKSPACE_ID_FILE, 'expected_workspace_id_file_required'),
    readRequiredFile(process.env.SUPERMEGA_EXPECTED_OWNER_ID_FILE, 'expected_owner_id_file_required'),
    readRequiredFile(process.env.SUPERMEGA_OWNER_ACCESS_TOKEN_FILE, 'owner_access_token_file_required'),
    readRequiredFile(process.env.SUPERMEGA_DENIED_ACCESS_TOKEN_FILE, 'denied_access_token_file_required'),
  ])
  const evidence = await verifyHostedClientPortal({
    baseUrl: process.env.SUPERMEGA_HOSTED_PORTAL_BASE_URL || 'https://app.supermega.dev',
    expectedCommit,
    expectedProducts: process.env.SUPERMEGA_EXPECTED_PRODUCTS,
    expectedWorkspaceId,
    expectedOwnerId,
    ownerToken,
    deniedToken,
  })
  const outputPath = String(process.env.SUPERMEGA_HOSTED_PORTAL_EVIDENCE_FILE || '').trim()
  assert(outputPath, 'hosted_portal_evidence_file_required')
  await writeFile(resolve(outputPath), `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  console.log(JSON.stringify({
    ok: true,
    contract: CONTRACT,
    status: evidence.status,
    exactReleaseCommit: evidence.target.exactReleaseCommit,
    expectedProducts: evidence.target.expectedProducts,
    ownerPortalReady: true,
    crossTenantDenied: true,
    tenantWritesPerformed: false,
    deploymentPerformed: false,
    secretValuesExposed: false,
    evidenceFile: resolve(outputPath),
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, contract: CONTRACT, error: String(error?.message || error).slice(0, 500), secretValuesExposed: false }, null, 2))
    process.exitCode = 1
  })
}

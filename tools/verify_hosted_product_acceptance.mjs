import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { verifyHostedClientPortal } from './verify_hosted_client_portal.mjs'

const CONTRACT = 'supermega.hosted_product_acceptance_smoke.v2'
const CONFIRMATION = 'RECORD HOSTED PRODUCT ACCEPTANCE'
const PRODUCTS = ['commerce', 'production', 'website', 'ecommerce']
const ALIASES = new Map([['shop', 'commerce'], ['plant', 'production']])
const SURFACES = new Map([
  ['commerce', 'commerce'],
  ['production', 'production'],
  ['website', 'website'],
  ['ecommerce', 'commerce'],
])
const UUID_URL_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'

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

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

export function portalEvidenceBindingDigest(value) {
  assert(isRecord(value)
    && value.contract === 'supermega.hosted_client_portal_smoke.v1'
    && value.status === 'passed'
    && typeof value.capturedAt === 'string', 'prerequisite_portal_evidence_invalid')
  const { capturedAt: _capturedAt, ...stableEvidence } = value
  return sha256(canonical(stableEvidence))
}

function products(value) {
  const requested = String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
  assert(requested.length > 0, 'expected_products_required')
  const normalized = requested.map((item) => ALIASES.get(item) || item)
  assert(normalized.every((item) => PRODUCTS.includes(item)), 'expected_products_invalid')
  assert(new Set(normalized).size === normalized.length, 'expected_products_duplicate')
  return PRODUCTS.filter((item) => normalized.includes(item))
}

function uuidBytes(value) {
  const compact = String(value || '').replaceAll('-', '').toLowerCase()
  assert(/^[0-9a-f]{32}$/.test(compact), 'uuid_invalid')
  return Buffer.from(compact, 'hex')
}

export function deterministicProbeId({ workspaceId, ownerApprovalId, releaseCommit, product }) {
  const name = `${workspaceId}\n${ownerApprovalId}\n${releaseCommit}\n${product}`
  const bytes = createHash('sha1').update(uuidBytes(UUID_URL_NAMESPACE)).update(name, 'utf8').digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function identifier(value, code) {
  const normalized = String(value || '').trim()
  assert(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(normalized), code)
  return normalized
}

function uuid(value, code) {
  const normalized = String(value || '').trim().toLowerCase()
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized), code)
  return normalized
}

function token(value, code) {
  const normalized = String(value || '').trim()
  assert(normalized.length >= 20 && normalized.length <= 16384 && !/\s/.test(normalized), code)
  return normalized
}

function baseUrl(value, allowHttp = false) {
  const parsed = new URL(String(value || 'https://app.supermega.dev'))
  assert((parsed.protocol === 'https:' || allowHttp)
    && !parsed.username && !parsed.password && !parsed.search && !parsed.hash
    && (parsed.pathname === '/' || parsed.pathname === ''), 'base_url_unsafe')
  return parsed.href.replace(/\/$/, '')
}

async function responseJson(response, code) {
  assert(/application\/json/i.test(response.headers.get('content-type') || ''), `${code}_content_type`, { status: response.status })
  assert(/\bno-store\b/i.test(response.headers.get('cache-control') || ''), `${code}_cacheable`)
  assert((response.headers.get('x-content-type-options') || '').toLowerCase() === 'nosniff', `${code}_nosniff_missing`)
  const raw = await response.text()
  assert(raw.length > 0 && raw.length <= 1024 * 1024, `${code}_body_size`, { status: response.status })
  try {
    return { body: JSON.parse(raw), digest: sha256(raw) }
  } catch {
    fail(`${code}_invalid_json`, { status: response.status })
  }
}

async function acceptanceRequest(fetchImpl, origin, path, { ownerToken, workspaceId, method = 'GET', body } = {}) {
  const response = await fetchImpl(`${origin}${path}`, {
    method,
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    headers: {
      accept: 'application/json',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'user-agent': 'SuperMegaHostedProductAcceptance/1.0',
      authorization: `Bearer ${ownerToken}`,
      'x-supermega-workspace-id': workspaceId,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { response, ...(await responseJson(response, 'product_acceptance')) }
}

function verifyAcceptanceResponse(value, expected, { idempotentReplay, externalWrite }) {
  assert(isRecord(value)
    && isRecord(value.acceptance)
    && value.product_state_mutated === false
    && value.external_writes_performed === externalWrite
    && value.secret_values_exposed === false, 'product_acceptance_response_invalid')
  const acceptance = value.acceptance
  assert(acceptance.contract === 'supermega.hosted_product_acceptance.v1'
    && acceptance.probe_id === expected.probeId
    && acceptance.owner_approval_id === expected.ownerApprovalId
    && acceptance.product === expected.product
    && acceptance.surface === SURFACES.get(expected.product)
    && acceptance.release_commit === expected.releaseCommit
    && Number.isInteger(acceptance.state_version)
    && acceptance.state_version >= 0
    && /^sha256:[0-9a-f]{64}$/.test(acceptance.state_digest)
    && typeof acceptance.recorded_at === 'string'
    && acceptance.recorded_at.length >= 20
    && acceptance.idempotent_replay === idempotentReplay, 'product_acceptance_record_invalid', { product: expected.product })
  return acceptance
}

function sameAcceptance(left, right) {
  const fields = ['contract', 'probe_id', 'owner_approval_id', 'product', 'surface', 'release_commit', 'state_version', 'state_digest', 'recorded_at']
  return fields.every((field) => left[field] === right[field])
}

export async function verifyHostedProductAcceptance({
  appBaseUrl,
  expectedCommit,
  expectedProducts,
  expectedWorkspaceId,
  expectedOwnerId,
  ownerApprovalId,
  ownerToken,
  deniedToken,
  prerequisitePortalEvidence,
  prerequisitePortalArtifactDigest,
  confirmation,
  productionHandoff = false,
  fetchImpl = fetch,
  allowHttp = false,
  capturedAt = new Date().toISOString(),
}) {
  assert(productionHandoff === true && confirmation === CONFIRMATION, 'production_handoff_confirmation_required')
  const origin = baseUrl(appBaseUrl, allowHttp)
  const releaseCommit = String(expectedCommit || '').trim().toLowerCase()
  assert(/^[0-9a-f]{40}$/.test(releaseCommit), 'expected_release_commit_invalid')
  const expectedProductList = Array.isArray(expectedProducts) ? products(expectedProducts.join(',')) : products(expectedProducts)
  const workspaceId = identifier(expectedWorkspaceId, 'expected_workspace_id_invalid')
  const ownerId = identifier(expectedOwnerId, 'expected_owner_id_invalid')
  const approvalId = uuid(ownerApprovalId, 'owner_approval_id_invalid')
  const ownerAccessToken = token(ownerToken, 'owner_access_token_invalid')
  const deniedAccessToken = token(deniedToken, 'denied_access_token_invalid')
  assert(ownerAccessToken !== deniedAccessToken, 'independent_principals_required')

  const portal = await verifyHostedClientPortal({
    baseUrl: origin,
    expectedCommit: releaseCommit,
    expectedProducts: expectedProductList,
    expectedWorkspaceId: workspaceId,
    expectedOwnerId: ownerId,
    ownerToken: ownerAccessToken,
    deniedToken: deniedAccessToken,
    fetchImpl,
    allowHttp,
    capturedAt,
  })
  const prerequisiteCapturedAt = Date.parse(prerequisitePortalEvidence?.capturedAt)
  const acceptanceCapturedAt = Date.parse(capturedAt)
  assert(Number.isFinite(prerequisiteCapturedAt)
    && Number.isFinite(acceptanceCapturedAt)
    && prerequisiteCapturedAt <= acceptanceCapturedAt, 'prerequisite_portal_time_invalid')
  const prerequisiteBindingDigest = portalEvidenceBindingDigest(prerequisitePortalEvidence)
  assert(prerequisiteBindingDigest === portalEvidenceBindingDigest(portal), 'prerequisite_portal_changed')
  const portalArtifactDigest = String(prerequisitePortalArtifactDigest || '').toLowerCase()
  assert(/^sha256:[0-9a-f]{64}$/.test(portalArtifactDigest), 'prerequisite_portal_artifact_digest_invalid')

  const acceptedProducts = []
  let newlyWritten = 0
  for (const product of expectedProductList) {
    const probeId = deterministicProbeId({ workspaceId, ownerApprovalId: approvalId, releaseCommit, product })
    const expected = { probeId, ownerApprovalId: approvalId, product, releaseCommit }
    const requestBody = {
      probe_id: probeId,
      owner_approval_id: approvalId,
      product,
      release_commit: releaseCommit,
      confirmation: CONFIRMATION,
    }
    const first = await acceptanceRequest(fetchImpl, origin, '/api/trial/v1/product-acceptance', {
      ownerToken: ownerAccessToken,
      workspaceId,
      method: 'POST',
      body: requestBody,
    })
    assert(first.response.status === 200, 'product_acceptance_write_failed', { product, status: first.response.status })
    const firstReplay = first.body?.acceptance?.idempotent_replay === true
    const recorded = verifyAcceptanceResponse(first.body, expected, {
      idempotentReplay: firstReplay,
      externalWrite: !firstReplay,
    })
    if (!firstReplay) newlyWritten += 1

    const readback = await acceptanceRequest(fetchImpl, origin, `/api/trial/v1/product-acceptance/${probeId}`, {
      ownerToken: ownerAccessToken,
      workspaceId,
    })
    assert(readback.response.status === 200, 'product_acceptance_readback_failed', { product, status: readback.response.status })
    const readRecord = verifyAcceptanceResponse(readback.body, expected, {
      idempotentReplay: false,
      externalWrite: false,
    })
    assert(sameAcceptance(recorded, readRecord), 'product_acceptance_readback_changed', { product })

    const denied = await acceptanceRequest(fetchImpl, origin, `/api/trial/v1/product-acceptance/${probeId}`, {
      ownerToken: deniedAccessToken,
      workspaceId,
    })
    assert(denied.response.status === 403 && denied.body?.detail?.code === 'trial_membership_required', 'product_acceptance_cross_tenant_visible', { product, status: denied.response.status })

    const replay = await acceptanceRequest(fetchImpl, origin, '/api/trial/v1/product-acceptance', {
      ownerToken: ownerAccessToken,
      workspaceId,
      method: 'POST',
      body: requestBody,
    })
    assert(replay.response.status === 200, 'product_acceptance_replay_failed', { product, status: replay.response.status })
    const replayRecord = verifyAcceptanceResponse(replay.body, expected, {
      idempotentReplay: true,
      externalWrite: false,
    })
    assert(sameAcceptance(recorded, replayRecord), 'product_acceptance_replay_changed', { product })

    acceptedProducts.push({
      product,
      surface: recorded.surface,
      probeId,
      stateVersion: recorded.state_version,
      stateDigest: recorded.state_digest,
      recordedAt: recorded.recorded_at,
      initialRequest: firstReplay ? 'idempotent_replay' : 'created',
      ownerReadbackPassed: true,
      crossTenantDenied: true,
      replayPassed: true,
      writeResponseDigest: first.digest,
      readbackResponseDigest: readback.digest,
      denialResponseDigest: denied.digest,
      replayResponseDigest: replay.digest,
    })
  }

  return {
    contract: CONTRACT,
    status: 'passed',
    capturedAt,
    target: {
      baseUrl: origin,
      exactReleaseCommit: releaseCommit,
      workspaceDigest: sha256(workspaceId),
      ownerDigest: sha256(ownerId),
      ownerApprovalDigest: sha256(approvalId),
      expectedProducts: expectedProductList,
    },
    prerequisitePortalArtifactDigest: portalArtifactDigest,
    prerequisitePortalBindingDigest: prerequisiteBindingDigest,
    products: acceptedProducts,
    summary: {
      productCount: acceptedProducts.length,
      newlyWritten,
      idempotentExisting: acceptedProducts.length - newlyWritten,
      ownerReadbacksPassed: acceptedProducts.length,
      crossTenantDenialsPassed: acceptedProducts.length,
      replaysPassed: acceptedProducts.length,
    },
    boundaries: {
      immutableAcceptanceEventsWrittenAtMost: acceptedProducts.length,
      productStateMutationsPerformed: false,
      deploymentPerformed: false,
      billingActivated: false,
      customerMessagesSent: false,
      scheduledAutomationEnabled: false,
      credentialsPersisted: false,
      clientIdentifiersPersisted: false,
      secretValuesExposed: false,
    },
  }
}

function currentHead() {
  const value = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim().toLowerCase()
  assert(/^[0-9a-f]{40}$/.test(value), 'current_head_commit_unavailable')
  return value
}

async function requiredFile(value, code) {
  const path = String(value || '').trim()
  assert(path, code)
  return (await readFile(resolve(path), 'utf8')).trim()
}

async function requiredJsonArtifact(value, code) {
  const path = String(value || '').trim()
  assert(path, code)
  const raw = await readFile(resolve(path), 'utf8')
  assert(raw.length > 0 && raw.length <= 1024 * 1024, `${code}_size`)
  try {
    return { value: JSON.parse(raw), digest: sha256(raw) }
  } catch {
    fail(`${code}_json_invalid`)
  }
}

function mockFetch() {
  const commit = 'a'.repeat(40)
  const events = new Map()
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers })
  return async (url, init) => {
    const path = new URL(url).pathname
    const auth = init.headers.authorization
    if (path === '/__release.json') return json({ service: 'supermega-app', canonicalDomain: 'https://app.supermega.dev', commit })
    if (path === '/api/health') return json({ status: 'ready', service: 'supermega-service', operating_mode: 'managed_trial', enterprise_db_ready: true, security_ready: true, authentication: { supabase_user_tokens_ready: true, anonymous_users_allowed: false }, trial_backend: { database_ready: true, role_ready: true, schema_ready: true, audit_ready: true, write_enabled: true, browser_service_role_exposed: false } })
    if (path === '/api/trial/v1/workspaces') return auth.includes('owner-token')
      ? json({ contract: 'supermega.managed_workspace_directory.v1', status: 'ready', workspaces: [{ workspace_id: 'workspace-owner', label: 'Owner company', access: 'owner' }], external_writes_performed: false, secret_values_exposed: false })
      : json({ contract: 'supermega.managed_workspace_directory.v1', status: 'ready', workspaces: [{ workspace_id: 'workspace-other', label: 'Other company', access: 'owner' }], external_writes_performed: false, secret_values_exposed: false })
    if (path === '/api/trial/v1/bootstrap' && auth.includes('owner-token')) return json({ identity: { workspace_id: 'workspace-owner', actor_id: 'owner-actor', actor_kind: 'human' }, readiness: { status: 'ready', backend: 'postgres', read_ready: true, write_ready: true, checks: { database_ready: true, role_ready: true, schema_ready: true, auth_ready: true, membership_ready: true, audit_ready: true, write_enabled: true }, capabilities: ['commerce.write', 'website.write'], productEntitlements: ['commerce', 'website'] }, states: { commerce: {}, website: {} }, approvals: [] })
    if (path === '/api/trial/v1/bootstrap') return json({ detail: { code: 'trial_membership_required' } }, 403)
    if (path === '/api/trial/v1/product-acceptance' && init.method === 'POST') {
      const body = JSON.parse(init.body)
      const existing = events.get(body.probe_id)
      const acceptance = existing || { contract: 'supermega.hosted_product_acceptance.v1', probe_id: body.probe_id, owner_approval_id: body.owner_approval_id, product: body.product, surface: SURFACES.get(body.product), release_commit: body.release_commit, state_version: 0, state_digest: `sha256:${'b'.repeat(64)}`, recorded_at: '2026-08-22T00:00:00+00:00', idempotent_replay: false }
      events.set(body.probe_id, acceptance)
      return json({ acceptance: { ...acceptance, idempotent_replay: Boolean(existing) }, product_state_mutated: false, external_writes_performed: !existing, secret_values_exposed: false })
    }
    if (path.startsWith('/api/trial/v1/product-acceptance/')) {
      if (!auth.includes('owner-token')) return json({ detail: { code: 'trial_membership_required' } }, 403)
      const probeId = path.split('/').at(-1)
      const acceptance = events.get(probeId)
      return acceptance
        ? json({ acceptance, product_state_mutated: false, external_writes_performed: false, secret_values_exposed: false })
        : json({ detail: { code: 'trial_not_found' } }, 404)
    }
    return json({ detail: { code: 'not_found' } }, 404)
  }
}

async function selfTest() {
  const fetchImpl = mockFetch()
  const portalInput = {
    appBaseUrl: 'http://127.0.0.1:4173', allowHttp: true, expectedCommit: 'a'.repeat(40),
    expectedProducts: 'shop,website', expectedWorkspaceId: 'workspace-owner', expectedOwnerId: 'owner-actor',
    ownerToken: 'owner-token-1234567890', deniedToken: 'denied-token-123456789',
    capturedAt: '2026-08-22T00:00:00.000Z',
  }
  const prerequisitePortalEvidence = await verifyHostedClientPortal({
    baseUrl: portalInput.appBaseUrl,
    expectedCommit: portalInput.expectedCommit,
    expectedProducts: portalInput.expectedProducts,
    expectedWorkspaceId: portalInput.expectedWorkspaceId,
    expectedOwnerId: portalInput.expectedOwnerId,
    ownerToken: portalInput.ownerToken,
    deniedToken: portalInput.deniedToken,
    fetchImpl,
    allowHttp: true,
    capturedAt: portalInput.capturedAt,
  })
  const input = {
    ...portalInput,
    ownerApprovalId: '11111111-1111-4111-8111-111111111111', confirmation: CONFIRMATION,
    productionHandoff: true, prerequisitePortalEvidence,
    prerequisitePortalArtifactDigest: sha256(JSON.stringify(prerequisitePortalEvidence)),
  }
  const evidence = await verifyHostedProductAcceptance({ ...input, fetchImpl })
  assert(evidence.status === 'passed' && evidence.summary.productCount === 2 && evidence.summary.newlyWritten === 2, 'self_test_positive_failed')
  assert(evidence.products.every((entry) => entry.ownerReadbackPassed && entry.crossTenantDenied && entry.replayPassed), 'self_test_product_proof_failed')
  const rendered = JSON.stringify(evidence)
  for (const forbidden of [input.ownerToken, input.deniedToken, input.expectedWorkspaceId, input.expectedOwnerId, input.ownerApprovalId]) {
    assert(!rendered.includes(forbidden), 'self_test_sensitive_value_persisted')
  }
  const probe = deterministicProbeId({ workspaceId: input.expectedWorkspaceId, ownerApprovalId: input.ownerApprovalId, releaseCommit: input.expectedCommit, product: 'commerce' })
  assert(probe === deterministicProbeId({ workspaceId: input.expectedWorkspaceId, ownerApprovalId: input.ownerApprovalId, releaseCommit: input.expectedCommit, product: 'commerce' }), 'self_test_probe_not_deterministic')
  let confirmationDenied = false
  try {
    await verifyHostedProductAcceptance({ ...input, confirmation: 'wrong', fetchImpl: mockFetch() })
  } catch (error) {
    confirmationDenied = String(error?.message || '').startsWith('production_handoff_confirmation_required:')
  }
  assert(confirmationDenied, 'self_test_missing_confirmation_accepted')
  let changedPortalDenied = false
  try {
    const changedPortal = structuredClone(prerequisitePortalEvidence)
    changedPortal.runtime.writesEnabled = false
    await verifyHostedProductAcceptance({ ...input, prerequisitePortalEvidence: changedPortal, fetchImpl: mockFetch() })
  } catch (error) {
    changedPortalDenied = String(error?.message || '').startsWith('prerequisite_portal_changed:')
  }
  assert(changedPortalDenied, 'self_test_changed_prerequisite_portal_accepted')
  console.log(JSON.stringify({ ok: true, contract: `${CONTRACT}.self_test`, checks: 10 }, null, 2))
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest()
  const productionHandoff = process.argv.includes('--production-handoff')
  const expectedCommit = process.argv.includes('--current-head') ? currentHead() : String(process.env.EXPECTED_RELEASE_COMMIT || '').trim()
  const [workspaceId, ownerId, approvalId, ownerAccessToken, deniedAccessToken, prerequisitePortal] = await Promise.all([
    requiredFile(process.env.SUPERMEGA_EXPECTED_WORKSPACE_ID_FILE, 'expected_workspace_id_file_required'),
    requiredFile(process.env.SUPERMEGA_EXPECTED_OWNER_ID_FILE, 'expected_owner_id_file_required'),
    requiredFile(process.env.SUPERMEGA_OWNER_APPROVAL_ID_FILE, 'owner_approval_id_file_required'),
    requiredFile(process.env.SUPERMEGA_OWNER_ACCESS_TOKEN_FILE, 'owner_access_token_file_required'),
    requiredFile(process.env.SUPERMEGA_DENIED_ACCESS_TOKEN_FILE, 'denied_access_token_file_required'),
    requiredJsonArtifact(process.env.SUPERMEGA_HOSTED_PORTAL_EVIDENCE_FILE, 'hosted_portal_evidence_file_required'),
  ])
  const evidence = await verifyHostedProductAcceptance({
    appBaseUrl: process.env.SUPERMEGA_HOSTED_PORTAL_BASE_URL || 'https://app.supermega.dev',
    expectedCommit,
    expectedProducts: process.env.SUPERMEGA_EXPECTED_PRODUCTS,
    expectedWorkspaceId: workspaceId,
    expectedOwnerId: ownerId,
    ownerApprovalId: approvalId,
    ownerToken: ownerAccessToken,
    deniedToken: deniedAccessToken,
    prerequisitePortalEvidence: prerequisitePortal.value,
    prerequisitePortalArtifactDigest: prerequisitePortal.digest,
    confirmation: process.env.SUPERMEGA_HOSTED_ACCEPTANCE_CONFIRMATION,
    productionHandoff,
  })
  const outputPath = String(process.env.SUPERMEGA_HOSTED_ACCEPTANCE_EVIDENCE_FILE || '').trim()
  assert(outputPath, 'hosted_acceptance_evidence_file_required')
  await writeFile(resolve(outputPath), `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  console.log(JSON.stringify({
    ok: true,
    contract: CONTRACT,
    status: evidence.status,
    exactReleaseCommit: evidence.target.exactReleaseCommit,
    products: evidence.target.expectedProducts,
    productAcceptances: evidence.summary.productCount,
    newlyWritten: evidence.summary.newlyWritten,
    crossTenantDenials: evidence.summary.crossTenantDenialsPassed,
    productStateMutationsPerformed: false,
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

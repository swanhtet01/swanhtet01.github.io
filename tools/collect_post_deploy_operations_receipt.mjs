#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const POST_DEPLOY_OPERATIONS_CONTRACT = 'supermega.post-deploy-operations-receipt.v2'
export const RUNTIME_LOG_EVIDENCE_CONTRACT = 'supermega.vercel-runtime-log-scan.v1'
export const ROLLBACK_EVIDENCE_CONTRACT = 'supermega.paired-rollback-target.v1'
export const PUBLIC_OBSERVABILITY_VISIBILITY_CONTRACT = 'supermega.public-observability-provider-visibility.v1'
export const PUBLIC_OBSERVABILITY_VISIBILITY_ATTESTATION_CONTRACT = 'supermega.public-observability-provider-visibility-attestation.v1'

const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const MAX_EVIDENCE_BYTES = 256 * 1024
const MAX_RESPONSE_BYTES = 1024 * 1024
const HTTP_TIMEOUT_MS = 15_000
const MAX_EVIDENCE_AGE_MS = 2 * 60 * 60 * 1000
const MAX_RUNTIME_WINDOW_MS = 30 * 60 * 1000
const PRODUCT_ROUTES = Object.freeze([
  ['shop', '/shop/'],
  ['plant', '/plant/'],
  ['website', '/website/'],
  ['ecommerce', '/ecommerce/'],
])
const PUBLIC_OBSERVABILITY_PATHS = Object.freeze([
  '/', '/shop/', '/plant/', '/website/', '/ecommerce/', '/contact/', '/privacy/',
])
const PRODUCTION_ORIGINS = Object.freeze({
  public: 'https://supermega.dev',
  app: 'https://app.supermega.dev',
})
const PRODUCTION_ALIASES = new Set([
  'supermega.dev',
  'www.supermega.dev',
  'app.supermega.dev',
  'megaos.vercel.app',
])
const PROJECTS = Object.freeze({
  public: 'prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR',
  app: 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG',
})
const SECRET_PATTERN = /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|vercel_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/
const PRIVATE_PATH_PATTERN = /(?:[A-Z]:\\Users\\|\/Users\/|\/home\/|OneDrive - )/iu
const URL_SCHEME_PATTERN = /https?:\/\//giu
const URL_AUTHORITY_BOUNDARY_PATTERN = /[\/?#\\\s"'<>]/u

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function containsCredentialUrl(value) {
  const text = String(value || '')
  for (const match of text.matchAll(URL_SCHEME_PATTERN)) {
    const authoritySuffix = text.slice(match.index + match[0].length)
    const boundary = authoritySuffix.search(URL_AUTHORITY_BOUNDARY_PATTERN)
    const authority = boundary === -1 ? authoritySuffix : authoritySuffix.slice(0, boundary)
    const userInfoEnd = authority.lastIndexOf('@')
    if (userInfoEnd > 0) return true
  }
  return false
}

function exactKeys(value, keys, code) {
  if (!isRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code)
}

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}`
}

function exactDigest(value, code) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!DIGEST_PATTERN.test(normalized)) fail(code)
  return normalized
}

function exactSha(value, code) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!SHA_PATTERN.test(normalized)) fail(code)
  return normalized
}

function exactTimestamp(value, code) {
  const normalized = String(value || '').trim()
  if (!TIMESTAMP_PATTERN.test(normalized) || new Date(normalized).toISOString() !== normalized) fail(code)
  return normalized
}

function exactBoolean(value, code) {
  if (typeof value !== 'boolean') fail(code)
  return value
}

function nullableBoolean(value, code) {
  if (value !== null && typeof value !== 'boolean') fail(code)
  return value
}

function nullableStatusCode(value, code) {
  if (value !== null && (!Number.isInteger(value) || value < 100 || value > 599)) fail(code)
  return value
}

function boundedCount(value, code) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) fail(code)
  return value
}

function assertNoPrivateOrSecretShape(value, code) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (SECRET_PATTERN.test(text) || PRIVATE_PATH_PATTERN.test(text) || containsCredentialUrl(text)) fail(code)
}

function normalizeOrigin(value, surface, stage) {
  let parsed
  try {
    parsed = new URL(String(value || '').trim())
  } catch {
    fail(`post_deploy_${surface}_origin_invalid`)
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
    || parsed.pathname !== '/' || parsed.search || parsed.hash) fail(`post_deploy_${surface}_origin_invalid`)
  const origin = parsed.origin.toLowerCase()
  if (stage === 'production') {
    if (origin !== PRODUCTION_ORIGINS[surface]) fail(`post_deploy_${surface}_production_origin_invalid`)
  } else if (!/^[a-z0-9-]+\.vercel\.app$/.test(parsed.hostname)
    || PRODUCTION_ALIASES.has(parsed.hostname)) {
    fail(`post_deploy_${surface}_preview_origin_invalid`)
  }
  return origin
}

function normalizeContext({ generatedAt, stage, expectedCommit, publicOrigin, appOrigin }) {
  const normalizedStage = String(stage || '').trim()
  if (!['preview', 'production'].includes(normalizedStage)) fail('post_deploy_stage_invalid')
  const context = {
    generatedAt: exactTimestamp(generatedAt, 'post_deploy_generated_at_invalid'),
    stage: normalizedStage,
    expectedCommit: exactSha(expectedCommit, 'post_deploy_expected_commit_invalid'),
    publicOrigin: normalizeOrigin(publicOrigin, 'public', normalizedStage),
    appOrigin: normalizeOrigin(appOrigin, 'app', normalizedStage),
  }
  if (context.publicOrigin === context.appOrigin) fail('post_deploy_origins_not_distinct')
  return context
}

function normalizeRuntimeLogEvidence(value, context) {
  if (value === null || value === undefined) return null
  exactKeys(value, [
    'contract', 'stage', 'expectedCommit', 'deploymentOrigins', 'window', 'errorCount',
    'materialWarningCount', 'queryMode', 'rawLogsRetained', 'secretValuesExposed', 'providerMutations',
  ], 'post_deploy_runtime_log_evidence_shape_invalid')
  if (value.contract !== RUNTIME_LOG_EVIDENCE_CONTRACT || value.stage !== context.stage) {
    fail('post_deploy_runtime_log_evidence_contract_invalid')
  }
  const expectedCommit = exactSha(value.expectedCommit, 'post_deploy_runtime_log_commit_invalid')
  if (expectedCommit !== context.expectedCommit) fail('post_deploy_runtime_log_commit_mismatch')
  exactKeys(value.deploymentOrigins, ['public', 'app'], 'post_deploy_runtime_log_origins_invalid')
  const publicOrigin = normalizeOrigin(value.deploymentOrigins.public, 'public', context.stage)
  const appOrigin = normalizeOrigin(value.deploymentOrigins.app, 'app', context.stage)
  if (publicOrigin !== context.publicOrigin || appOrigin !== context.appOrigin) fail('post_deploy_runtime_log_origins_mismatch')
  exactKeys(value.window, ['startedAt', 'endedAt'], 'post_deploy_runtime_log_window_invalid')
  const startedAt = exactTimestamp(value.window.startedAt, 'post_deploy_runtime_log_window_start_invalid')
  const endedAt = exactTimestamp(value.window.endedAt, 'post_deploy_runtime_log_window_end_invalid')
  if (Date.parse(endedAt) < Date.parse(startedAt) || Date.parse(endedAt) > Date.parse(context.generatedAt) + 60_000) {
    fail('post_deploy_runtime_log_window_order_invalid')
  }
  if (value.queryMode !== 'read_only' || value.rawLogsRetained !== false
    || value.secretValuesExposed !== false || value.providerMutations !== 0) {
    fail('post_deploy_runtime_log_controls_invalid')
  }
  return {
    contract: RUNTIME_LOG_EVIDENCE_CONTRACT,
    stage: context.stage,
    expectedCommit,
    deploymentOrigins: { public: publicOrigin, app: appOrigin },
    window: { startedAt, endedAt },
    errorCount: boundedCount(value.errorCount, 'post_deploy_runtime_log_error_count_invalid'),
    materialWarningCount: boundedCount(value.materialWarningCount, 'post_deploy_runtime_log_warning_count_invalid'),
    queryMode: 'read_only',
    rawLogsRetained: false,
    secretValuesExposed: false,
    providerMutations: 0,
  }
}

function normalizeRollbackEvidence(value, context) {
  if (value === null || value === undefined) return null
  exactKeys(value, [
    'contract', 'expectedCommit', 'capturedAt', 'queryMode', 'providerMutations',
    'secretValuesExposed', 'targets',
  ], 'post_deploy_rollback_evidence_shape_invalid')
  if (value.contract !== ROLLBACK_EVIDENCE_CONTRACT) fail('post_deploy_rollback_evidence_contract_invalid')
  const expectedCommit = exactSha(value.expectedCommit, 'post_deploy_rollback_expected_commit_invalid')
  if (expectedCommit !== context.expectedCommit) fail('post_deploy_rollback_expected_commit_mismatch')
  const capturedAt = exactTimestamp(value.capturedAt, 'post_deploy_rollback_captured_at_invalid')
  if (Date.parse(capturedAt) > Date.parse(context.generatedAt) + 60_000) fail('post_deploy_rollback_captured_in_future')
  if (value.queryMode !== 'read_only' || value.providerMutations !== 0 || value.secretValuesExposed !== false) {
    fail('post_deploy_rollback_controls_invalid')
  }
  if (!Array.isArray(value.targets) || value.targets.length !== 2) fail('post_deploy_rollback_targets_invalid')
  const targets = value.targets.map((target, index) => {
    exactKeys(target, ['surface', 'projectId', 'deploymentId', 'url', 'readyState', 'target', 'commit'], 'post_deploy_rollback_target_shape_invalid')
    const surface = index === 0 ? 'public' : 'app'
    if (target.surface !== surface || target.projectId !== PROJECTS[surface]) fail('post_deploy_rollback_target_project_invalid')
    const deploymentId = String(target.deploymentId || '').trim()
    if (!/^dpl_[A-Za-z0-9]{6,}$/.test(deploymentId)) fail('post_deploy_rollback_deployment_id_invalid')
    let url
    try {
      url = new URL(String(target.url || '').trim())
    } catch {
      fail('post_deploy_rollback_url_invalid')
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/'
      || url.search || url.hash || !/^[a-z0-9-]+\.vercel\.app$/.test(url.hostname)) {
      fail('post_deploy_rollback_url_invalid')
    }
    const readyState = String(target.readyState || '').trim()
    if (!['READY', 'ERROR', 'CANCELED', 'BUILDING', 'QUEUED'].includes(readyState)) fail('post_deploy_rollback_ready_state_invalid')
    const targetEnvironment = target.target === null ? null : String(target.target || '').trim()
    if (![null, 'production'].includes(targetEnvironment)) fail('post_deploy_rollback_environment_invalid')
    return {
      surface,
      projectId: PROJECTS[surface],
      deploymentId,
      url: url.origin.toLowerCase(),
      readyState,
      target: targetEnvironment,
      commit: exactSha(target.commit, 'post_deploy_rollback_commit_invalid'),
    }
  })
  if (targets[0].url === targets[1].url || targets[0].deploymentId === targets[1].deploymentId) {
    fail('post_deploy_rollback_targets_not_distinct')
  }
  return {
    contract: ROLLBACK_EVIDENCE_CONTRACT,
    expectedCommit,
    capturedAt,
    queryMode: 'read_only',
    providerMutations: 0,
    secretValuesExposed: false,
    targets,
  }
}

function normalizePublicObservabilityVisibilityEvidence(value, context) {
  if (value === null || value === undefined) return null
  if (context.stage !== 'production') fail('post_deploy_public_observability_preview_evidence_forbidden')
  exactKeys(value, [
    'contract', 'expectedCommit', 'projectId', 'environment', 'capturedAt', 'window', 'queryMode',
    'query', 'webAnalytics', 'speedInsights', 'providerEvidenceDigest', 'rawEventsRetained', 'personalDataRetained',
    'credentialValuesExposed', 'sourcePresenceUsedAsTelemetryEvidence', 'providerMutations',
  ], 'post_deploy_public_observability_evidence_shape_invalid')
  if (value.contract !== PUBLIC_OBSERVABILITY_VISIBILITY_CONTRACT) fail('post_deploy_public_observability_evidence_contract_invalid')
  const expectedCommit = exactSha(value.expectedCommit, 'post_deploy_public_observability_commit_invalid')
  if (expectedCommit !== context.expectedCommit) fail('post_deploy_public_observability_commit_mismatch')
  if (value.projectId !== PROJECTS.public || value.environment !== 'production') fail('post_deploy_public_observability_target_invalid')
  const capturedAt = exactTimestamp(value.capturedAt, 'post_deploy_public_observability_captured_at_invalid')
  if (Date.parse(capturedAt) > Date.parse(context.generatedAt) + 60_000) fail('post_deploy_public_observability_captured_in_future')
  exactKeys(value.window, ['startedAt', 'endedAt'], 'post_deploy_public_observability_window_invalid')
  const startedAt = exactTimestamp(value.window.startedAt, 'post_deploy_public_observability_window_start_invalid')
  const endedAt = exactTimestamp(value.window.endedAt, 'post_deploy_public_observability_window_end_invalid')
  if (Date.parse(endedAt) < Date.parse(startedAt) || Date.parse(endedAt) > Date.parse(capturedAt)
    || Date.parse(endedAt) - Date.parse(startedAt) > MAX_RUNTIME_WINDOW_MS) {
    fail('post_deploy_public_observability_window_order_invalid')
  }
  if (value.queryMode !== 'read_only' || value.rawEventsRetained !== false
    || value.personalDataRetained !== false || value.credentialValuesExposed !== false
    || value.sourcePresenceUsedAsTelemetryEvidence !== false || value.providerMutations !== 0) {
    fail('post_deploy_public_observability_controls_invalid')
  }
  exactKeys(value.query, [
    'source', 'pathAllowlist', 'webAnalyticsMetric', 'speedInsightsMetric',
  ], 'post_deploy_public_observability_query_invalid')
  if (value.query.source !== 'vercel_observability_dashboard'
    || JSON.stringify(value.query.pathAllowlist) !== JSON.stringify(PUBLIC_OBSERVABILITY_PATHS)
    || value.query.webAnalyticsMetric !== 'pageviews'
    || value.query.speedInsightsMetric !== 'core_web_vitals') {
    fail('post_deploy_public_observability_query_contract_invalid')
  }
  const normalizeSignal = (signal, code) => {
    exactKeys(signal, ['status', 'dataPointCount'], code)
    if (!['observed', 'not_observed'].includes(signal.status)) fail(`${code}_status_invalid`)
    const dataPointCount = boundedCount(signal.dataPointCount, `${code}_count_invalid`)
    if ((signal.status === 'observed') !== (dataPointCount > 0)) fail(`${code}_status_count_mismatch`)
    return { status: signal.status, dataPointCount }
  }
  return {
    contract: PUBLIC_OBSERVABILITY_VISIBILITY_CONTRACT,
    expectedCommit,
    projectId: PROJECTS.public,
    environment: 'production',
    capturedAt,
    window: { startedAt, endedAt },
    queryMode: 'read_only',
    query: {
      source: 'vercel_observability_dashboard',
      pathAllowlist: [...PUBLIC_OBSERVABILITY_PATHS],
      webAnalyticsMetric: 'pageviews',
      speedInsightsMetric: 'core_web_vitals',
    },
    webAnalytics: normalizeSignal(value.webAnalytics, 'post_deploy_public_web_analytics_evidence_invalid'),
    speedInsights: normalizeSignal(value.speedInsights, 'post_deploy_public_speed_insights_evidence_invalid'),
    providerEvidenceDigest: exactDigest(value.providerEvidenceDigest, 'post_deploy_public_observability_provider_evidence_digest_invalid'),
    rawEventsRetained: false,
    personalDataRetained: false,
    credentialValuesExposed: false,
    sourcePresenceUsedAsTelemetryEvidence: false,
    providerMutations: 0,
  }
}

function normalizePublicObservabilityVisibilityAttestation(value, context, visibilityEnvelope) {
  if (value === null || value === undefined) return null
  if (!visibilityEnvelope) fail('post_deploy_public_observability_attestation_without_visibility')
  if (context.stage !== 'production') fail('post_deploy_public_observability_preview_attestation_forbidden')
  exactKeys(value, [
    'contract', 'expectedCommit', 'projectId', 'environment', 'reviewedAt', 'reviewerRole',
    'reviewMethod', 'reviewOutcome', 'visibilitySourceDigest', 'visibilityReceiptDigest',
    'providerEvidenceDigest', 'providerDashboardReviewed', 'queryAndCountsReviewed',
    'manualAttestationNotCryptographic', 'sourcePresenceUsedAsTelemetryEvidence',
    'rawProviderEvidenceRetained', 'credentialValuesExposed', 'providerMutations',
  ], 'post_deploy_public_observability_attestation_shape_invalid')
  if (value.contract !== PUBLIC_OBSERVABILITY_VISIBILITY_ATTESTATION_CONTRACT
    || value.expectedCommit !== context.expectedCommit || value.projectId !== PROJECTS.public
    || value.environment !== 'production' || value.reviewerRole !== 'owner'
    || value.reviewMethod !== 'manual_vercel_dashboard'
    || !['accept', 'reject'].includes(value.reviewOutcome)) {
    fail('post_deploy_public_observability_attestation_contract_invalid')
  }
  const reviewedAt = exactTimestamp(value.reviewedAt, 'post_deploy_public_observability_attestation_reviewed_at_invalid')
  if (Date.parse(reviewedAt) < Date.parse(visibilityEnvelope.receipt.capturedAt)
    || Date.parse(reviewedAt) > Date.parse(context.generatedAt) + 60_000) {
    fail('post_deploy_public_observability_attestation_time_invalid')
  }
  const visibilitySourceDigest = exactDigest(value.visibilitySourceDigest, 'post_deploy_public_observability_attestation_source_digest_invalid')
  const visibilityReceiptDigest = exactDigest(value.visibilityReceiptDigest, 'post_deploy_public_observability_attestation_receipt_digest_invalid')
  const providerEvidenceDigest = exactDigest(value.providerEvidenceDigest, 'post_deploy_public_observability_attestation_provider_digest_invalid')
  if (visibilitySourceDigest !== visibilityEnvelope.sourceDigest
    || visibilityReceiptDigest !== digest(JSON.stringify(visibilityEnvelope.receipt))
    || providerEvidenceDigest !== visibilityEnvelope.receipt.providerEvidenceDigest) {
    fail('post_deploy_public_observability_attestation_binding_mismatch')
  }
  if (value.providerDashboardReviewed !== true || value.queryAndCountsReviewed !== true
    || value.manualAttestationNotCryptographic !== true
    || value.sourcePresenceUsedAsTelemetryEvidence !== false || value.rawProviderEvidenceRetained !== false
    || value.credentialValuesExposed !== false || value.providerMutations !== 0) {
    fail('post_deploy_public_observability_attestation_controls_invalid')
  }
  return {
    contract: PUBLIC_OBSERVABILITY_VISIBILITY_ATTESTATION_CONTRACT,
    expectedCommit: context.expectedCommit,
    projectId: PROJECTS.public,
    environment: 'production',
    reviewedAt,
    reviewerRole: 'owner',
    reviewMethod: 'manual_vercel_dashboard',
    reviewOutcome: value.reviewOutcome,
    visibilitySourceDigest,
    visibilityReceiptDigest,
    providerEvidenceDigest,
    providerDashboardReviewed: true,
    queryAndCountsReviewed: true,
    manualAttestationNotCryptographic: true,
    sourcePresenceUsedAsTelemetryEvidence: false,
    rawProviderEvidenceRetained: false,
    credentialValuesExposed: false,
    providerMutations: 0,
  }
}

function evidenceEnvelope(value, sourceDigest, normalizer, context, code) {
  if (value === null || value === undefined) {
    if (sourceDigest !== null && sourceDigest !== undefined) fail(`${code}_digest_without_evidence`)
    return null
  }
  return {
    sourceDigest: exactDigest(sourceDigest, `${code}_source_digest_invalid`),
    receipt: normalizer(value, context),
  }
}

function hasRestrictedScriptSources(csp) {
  const scriptDirectives = String(csp || '')
    .split(';')
    .map((directive) => directive.trim())
    .filter((directive) => /^script-src(?:\s|$)/iu.test(directive))
  if (scriptDirectives.length !== 1) return false
  const tokens = scriptDirectives[0].split(/\s+/u)
  if (tokens.shift()?.toLowerCase() !== 'script-src' || tokens.shift()?.toLowerCase() !== "'self'") return false
  return tokens.every((token) => /^'sha256-[A-Za-z0-9+/]{43}='$/u.test(token))
}

function booleanHeaderEvidence(headers) {
  const csp = String(headers.get('content-security-policy') || '')
  const permissions = String(headers.get('permissions-policy') || '')
  return {
    contentSecurityPolicyPresent: Boolean(csp),
    scriptSourcesRestricted: hasRestrictedScriptSources(csp),
    frameAncestorsNone: /(?:^|;)\s*frame-ancestors\s+'none'\s*(?:;|$)/i.test(csp),
    cameraSelf: /(?:^|,)\s*camera=\(self\)\s*(?:,|$)/i.test(permissions),
    sensitiveCapabilitiesDenied: ['geolocation=()', 'microphone=()', 'payment=()', 'usb=()'].every((token) => permissions.includes(token)),
    referrerNoReferrer: String(headers.get('referrer-policy') || '').toLowerCase() === 'no-referrer',
    noSniff: String(headers.get('x-content-type-options') || '').toLowerCase() === 'nosniff',
    frameDenied: String(headers.get('x-frame-options') || '').toUpperCase() === 'DENY',
  }
}

function responseLooksPublicSafe(text) {
  return !SECRET_PATTERN.test(text) && !PRIVATE_PATH_PATTERN.test(text) && !containsCredentialUrl(text)
}

async function readBoundedResponseBody(response) {
  const declared = String(response.headers.get('content-length') || '').trim()
  if (/^\d+$/.test(declared) && Number(declared) > MAX_RESPONSE_BYTES) {
    if (typeof response.body?.cancel === 'function') {
      await response.body.cancel().catch(() => {})
    }
    return { text: '', tooLarge: true }
  }
  if (!response.body) return { text: '', tooLarge: false }
  if (typeof response.body.getReader !== 'function') {
    if (typeof response.body.cancel === 'function') {
      await response.body.cancel().catch(() => {})
    }
    return { text: '', tooLarge: true }
  }
  const reader = response.body.getReader()
  const chunks = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!(value instanceof Uint8Array)) fail('post_deploy_response_chunk_invalid')
      totalBytes += value.byteLength
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {})
        return { text: '', tooLarge: true }
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const payload = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    payload.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { text: new TextDecoder().decode(payload), tooLarge: false }
}

async function getText(fetchImpl, url, accept) {
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      headers: {
        accept,
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        'user-agent': 'SuperMegaPostDeployOperationsReceipt/1.0',
      },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    })
    const body = await readBoundedResponseBody(response)
    return { statusCode: response.status, headers: response.headers, ...body }
  } catch {
    return { statusCode: null, headers: new Headers(), text: '', tooLarge: false }
  }
}

function parseJson(text) {
  try {
    const parsed = JSON.parse(text)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function probeRelease(fetchImpl, origin, surface) {
  const response = await getText(fetchImpl, new URL('/__release.json', origin), 'application/json')
  const body = parseJson(response.text)
  const expectedService = surface === 'public' ? 'supermega-public-site' : 'supermega-app'
  const service = body?.service === expectedService ? expectedService : null
  const commit = typeof body?.commit === 'string' && SHA_PATTERN.test(body.commit.toLowerCase()) ? body.commit.toLowerCase() : null
  const canonicalDomain = surface === 'app' && body?.canonicalDomain === 'https://app.supermega.dev'
    ? 'https://app.supermega.dev'
    : null
  return {
    statusCode: response.statusCode,
    jsonValid: Boolean(body) && !response.tooLarge,
    responseSafe: responseLooksPublicSafe(response.text),
    service,
    commit,
    canonicalDomain,
  }
}

async function probeHealth(fetchImpl, origin, surface) {
  const response = await getText(fetchImpl, new URL('/api/health', origin), 'application/json')
  const body = parseJson(response.text)
  const expectedService = surface === 'public' ? 'supermega-public-site' : 'supermega-service'
  const status = body?.status === 'ready' ? 'ready' : null
  const commit = typeof body?.commit === 'string' && SHA_PATTERN.test(body.commit.toLowerCase()) ? body.commit.toLowerCase() : null
  const operatingMode = ['isolated_demo', 'managed_trial'].includes(body?.operating_mode) ? body.operating_mode : null
  const secretValuesExposed = typeof body?.secret_values_exposed === 'boolean'
    ? body.secret_values_exposed
    : typeof body?.enterprise_activation?.secret_values_exposed === 'boolean'
      ? body.enterprise_activation.secret_values_exposed
      : null
  return {
    statusCode: response.statusCode,
    jsonValid: Boolean(body) && !response.tooLarge,
    responseSafe: responseLooksPublicSafe(response.text),
    service: body?.service === expectedService ? expectedService : null,
    status,
    ok: typeof body?.ok === 'boolean' ? body.ok : null,
    commit,
    operatingMode,
    enterpriseDbReady: typeof body?.enterprise_db_ready === 'boolean' ? body.enterprise_db_ready : null,
    securityReady: typeof body?.security_ready === 'boolean' ? body.security_ready : null,
    writeEnabled: typeof body?.trial_backend?.write_enabled === 'boolean' ? body.trial_backend.write_enabled : null,
    browserServiceRoleExposed: typeof body?.trial_backend?.browser_service_role_exposed === 'boolean'
      ? body.trial_backend.browser_service_role_exposed
      : null,
    activationEvidenceReady: typeof body?.enterprise_activation?.evidence_ready === 'boolean'
      ? body.enterprise_activation.evidence_ready
      : null,
    secretValuesExposed,
  }
}

async function probeHtml(fetchImpl, origin, id, path) {
  const response = await getText(fetchImpl, new URL(path, origin), 'text/html')
  const html = /^text\/html(?:;|$)/i.test(String(response.headers.get('content-type') || ''))
  return {
    id,
    path,
    statusCode: response.statusCode,
    html,
    appShell: response.text.includes('<div id="root"></div>'),
    observabilityBootstrap: response.text.includes('<script src="/vercel-insights.js"></script>'),
    responseSafe: responseLooksPublicSafe(response.text),
    headers: booleanHeaderEvidence(response.headers),
  }
}

async function probeLoader(fetchImpl, appOrigin) {
  const response = await getText(fetchImpl, new URL('/vercel-insights.js', appOrigin), 'text/javascript, application/javascript')
  const source = response.text
  return {
    statusCode: response.statusCode,
    javascript: /(?:javascript|ecmascript)/i.test(String(response.headers.get('content-type') || '')) && source.length > 0,
    responseSafe: responseLooksPublicSafe(source),
    productionHostGuard: source.includes("/(^|\\.)supermega\\.dev$/.test(location.hostname)"),
    analyticsQueue: source.includes('window.va = window.va || function ()') && source.includes('window.vaq'),
    speedInsightsQueue: source.includes('window.si = window.si || function ()') && source.includes('window.siq'),
    webAnalyticsBootstrap: source.includes("'/_vercel/insights/script.js'"),
    speedInsightsBootstrap: source.includes("'/_vercel/speed-insights/script.js'"),
    sameOriginOnly: !/https?:\/\//i.test(source),
  }
}

function publicObservabilityAttestationEnvelope(value, sourceDigest, context, visibilityEnvelope) {
  if (value === null || value === undefined) {
    if (sourceDigest !== null && sourceDigest !== undefined) fail('post_deploy_public_observability_attestation_digest_without_evidence')
    return null
  }
  return {
    sourceDigest: exactDigest(sourceDigest, 'post_deploy_public_observability_attestation_source_file_digest_invalid'),
    receipt: normalizePublicObservabilityVisibilityAttestation(value, context, visibilityEnvelope),
  }
}

async function probePublicLoader(fetchImpl, publicOrigin) {
  const response = await getText(fetchImpl, new URL('/vercel-insights.js', publicOrigin), 'text/javascript, application/javascript')
  const source = response.text
  const analyticsBeforeSendIndex = source.indexOf("window.va('beforeSend'")
  const speedBeforeSendIndex = source.indexOf("window.si('beforeSend'")
  const analyticsScriptIndex = source.indexOf("'/_vercel/insights/script.js'")
  const speedScriptIndex = source.indexOf("'/_vercel/speed-insights/script.js'")
  return {
    statusCode: response.statusCode,
    javascript: /(?:javascript|ecmascript)/i.test(String(response.headers.get('content-type') || '')) && source.length > 0,
    responseSafe: responseLooksPublicSafe(source),
    exactProductionHosts: source.includes('["supermega.dev","www.supermega.dev"]')
      && source.includes("location.protocol !== 'https:'")
      && source.includes('!hosts.includes(location.hostname)'),
    canonicalPathAllowlist: source.includes('["/","/shop/","/plant/","/website/","/ecommerce/","/contact/","/privacy/"]')
      && source.includes('!paths.has(url.pathname)'),
    analyticsQueue: source.includes('window.va = window.va || function ()') && source.includes('window.vaq'),
    speedInsightsQueue: source.includes('window.si = window.si || function ()') && source.includes('window.siq'),
    analyticsBeforeSendFirst: analyticsBeforeSendIndex !== -1 && analyticsScriptIndex !== -1 && analyticsBeforeSendIndex < analyticsScriptIndex,
    speedInsightsBeforeSendFirst: speedBeforeSendIndex !== -1 && speedScriptIndex !== -1 && speedBeforeSendIndex < speedScriptIndex,
    pageviewsOnly: source.includes("safeEvent(event, 'pageview')") && source.includes('event.type !== expectedType'),
    coreWebVitalsOnly: source.includes("safeEvent(event, 'vital')") && source.includes("expectedType === 'vital'"),
    queryAndHashStripped: source.includes('url.origin + url.pathname') && !source.includes('url.search') && !source.includes('url.hash'),
    webAnalyticsBootstrap: analyticsScriptIndex !== -1,
    speedInsightsBootstrap: speedScriptIndex !== -1,
    sameOriginOnly: !/https?:\/\//i.test(source),
    sourcePresenceObservedTelemetry: false,
  }
}

async function probeProviderScript(fetchImpl, origin, path, kind) {
  const response = await getText(fetchImpl, new URL(path, origin), 'text/javascript, application/javascript')
  const contentType = String(response.headers.get('content-type') || '')
  const source = response.text
  const signature = kind === 'web-analytics'
    ? /(?:\bvaq\b|window\.va\b|\/_vercel\/insights\/(?:view|event))/i.test(source)
    : /(?:\bsiq\b|window\.si\b)/i.test(source) && /(?:web.?vitals?|\bvitals\b)/i.test(source)
  return {
    statusCode: response.statusCode,
    javascript: /(?:javascript|ecmascript)/i.test(contentType) && source.length > 0,
    signature,
  }
}

export async function collectPostDeployProbes({ stage, publicOrigin, appOrigin, fetchImpl = fetch }) {
  const release = {
    public: await probeRelease(fetchImpl, publicOrigin, 'public'),
    app: await probeRelease(fetchImpl, appOrigin, 'app'),
  }
  const health = {
    public: await probeHealth(fetchImpl, publicOrigin, 'public'),
    app: await probeHealth(fetchImpl, appOrigin, 'app'),
  }
  const publicHome = await probeHtml(fetchImpl, publicOrigin, 'public-home', '/')
  const routes = []
  for (const [id, path] of PRODUCT_ROUTES) routes.push(await probeHtml(fetchImpl, appOrigin, id, path))
  const loader = await probeLoader(fetchImpl, appOrigin)
  const publicLoader = await probePublicLoader(fetchImpl, publicOrigin)
  const providerRuntime = stage === 'production'
    ? {
        expected: true,
        webAnalytics: await probeProviderScript(fetchImpl, appOrigin, '/_vercel/insights/script.js', 'web-analytics'),
        speedInsights: await probeProviderScript(fetchImpl, appOrigin, '/_vercel/speed-insights/script.js', 'speed-insights'),
      }
    : { expected: false, webAnalytics: null, speedInsights: null }
  const publicProviderRuntime = stage === 'production'
    ? {
        expected: true,
        webAnalytics: await probeProviderScript(fetchImpl, publicOrigin, '/_vercel/insights/script.js', 'web-analytics'),
        speedInsights: await probeProviderScript(fetchImpl, publicOrigin, '/_vercel/speed-insights/script.js', 'speed-insights'),
      }
    : { expected: false, webAnalytics: null, speedInsights: null }
  return { release, health, publicHome, routes, observability: { loader, publicLoader, providerRuntime, publicProviderRuntime } }
}

function normalizeReleaseProbe(value, code) {
  exactKeys(value, ['statusCode', 'jsonValid', 'responseSafe', 'service', 'commit', 'canonicalDomain'], code)
  return {
    statusCode: nullableStatusCode(value.statusCode, `${code}_status`),
    jsonValid: exactBoolean(value.jsonValid, `${code}_json`),
    responseSafe: exactBoolean(value.responseSafe, `${code}_safe`),
    service: value.service === null || ['supermega-public-site', 'supermega-app'].includes(value.service) ? value.service : fail(`${code}_service`),
    commit: value.commit === null ? null : exactSha(value.commit, `${code}_commit`),
    canonicalDomain: value.canonicalDomain === null || value.canonicalDomain === 'https://app.supermega.dev'
      ? value.canonicalDomain
      : fail(`${code}_canonical`),
  }
}

function normalizeHealthProbe(value, code) {
  exactKeys(value, [
    'statusCode', 'jsonValid', 'responseSafe', 'service', 'status', 'ok', 'commit', 'operatingMode',
    'enterpriseDbReady', 'securityReady', 'writeEnabled', 'browserServiceRoleExposed',
    'activationEvidenceReady', 'secretValuesExposed',
  ], code)
  return {
    statusCode: nullableStatusCode(value.statusCode, `${code}_status_code`),
    jsonValid: exactBoolean(value.jsonValid, `${code}_json`),
    responseSafe: exactBoolean(value.responseSafe, `${code}_safe`),
    service: value.service === null || ['supermega-public-site', 'supermega-service'].includes(value.service) ? value.service : fail(`${code}_service`),
    status: value.status === null || value.status === 'ready' ? value.status : fail(`${code}_status`),
    ok: nullableBoolean(value.ok, `${code}_ok`),
    commit: value.commit === null ? null : exactSha(value.commit, `${code}_commit`),
    operatingMode: value.operatingMode === null || ['isolated_demo', 'managed_trial'].includes(value.operatingMode)
      ? value.operatingMode
      : fail(`${code}_operating_mode`),
    enterpriseDbReady: nullableBoolean(value.enterpriseDbReady, `${code}_db`),
    securityReady: nullableBoolean(value.securityReady, `${code}_security`),
    writeEnabled: nullableBoolean(value.writeEnabled, `${code}_write`),
    browserServiceRoleExposed: nullableBoolean(value.browserServiceRoleExposed, `${code}_role`),
    activationEvidenceReady: nullableBoolean(value.activationEvidenceReady, `${code}_activation`),
    secretValuesExposed: nullableBoolean(value.secretValuesExposed, `${code}_secret`),
  }
}

function normalizeHtmlProbe(value, expectedId, expectedPath, code) {
  exactKeys(value, ['id', 'path', 'statusCode', 'html', 'appShell', 'observabilityBootstrap', 'responseSafe', 'headers'], code)
  if (value.id !== expectedId || value.path !== expectedPath) fail(`${code}_identity`)
  exactKeys(value.headers, [
    'contentSecurityPolicyPresent', 'scriptSourcesRestricted', 'frameAncestorsNone', 'cameraSelf',
    'sensitiveCapabilitiesDenied', 'referrerNoReferrer', 'noSniff', 'frameDenied',
  ], `${code}_headers`)
  return {
    id: expectedId,
    path: expectedPath,
    statusCode: nullableStatusCode(value.statusCode, `${code}_status`),
    html: exactBoolean(value.html, `${code}_html`),
    appShell: exactBoolean(value.appShell, `${code}_shell`),
    observabilityBootstrap: exactBoolean(value.observabilityBootstrap, `${code}_bootstrap`),
    responseSafe: exactBoolean(value.responseSafe, `${code}_safe`),
    headers: Object.fromEntries(Object.entries(value.headers).map(([key, item]) => [key, exactBoolean(item, `${code}_${key}`)])),
  }
}

function normalizeProbes(value, stage) {
  exactKeys(value, ['release', 'health', 'publicHome', 'routes', 'observability'], 'post_deploy_probes_shape_invalid')
  exactKeys(value.release, ['public', 'app'], 'post_deploy_release_probes_invalid')
  exactKeys(value.health, ['public', 'app'], 'post_deploy_health_probes_invalid')
  if (!Array.isArray(value.routes) || value.routes.length !== PRODUCT_ROUTES.length) fail('post_deploy_route_probes_invalid')
  exactKeys(value.observability, ['loader', 'publicLoader', 'providerRuntime', 'publicProviderRuntime'], 'post_deploy_observability_probes_invalid')
  const loader = value.observability.loader
  exactKeys(loader, [
    'statusCode', 'javascript', 'responseSafe', 'productionHostGuard', 'analyticsQueue',
    'speedInsightsQueue', 'webAnalyticsBootstrap', 'speedInsightsBootstrap', 'sameOriginOnly',
  ], 'post_deploy_loader_probe_invalid')
  const normalizedLoader = {
    statusCode: nullableStatusCode(loader.statusCode, 'post_deploy_loader_status_invalid'),
    ...Object.fromEntries(Object.entries(loader).filter(([key]) => key !== 'statusCode')
      .map(([key, item]) => [key, exactBoolean(item, `post_deploy_loader_${key}_invalid`)])),
  }
  const publicLoader = value.observability.publicLoader
  exactKeys(publicLoader, [
    'statusCode', 'javascript', 'responseSafe', 'exactProductionHosts', 'canonicalPathAllowlist',
    'analyticsQueue', 'speedInsightsQueue', 'analyticsBeforeSendFirst', 'speedInsightsBeforeSendFirst',
    'pageviewsOnly', 'coreWebVitalsOnly', 'queryAndHashStripped', 'webAnalyticsBootstrap',
    'speedInsightsBootstrap', 'sameOriginOnly', 'sourcePresenceObservedTelemetry',
  ], 'post_deploy_public_loader_probe_invalid')
  const normalizedPublicLoader = {
    statusCode: nullableStatusCode(publicLoader.statusCode, 'post_deploy_public_loader_status_invalid'),
    ...Object.fromEntries(Object.entries(publicLoader).filter(([key]) => key !== 'statusCode')
      .map(([key, item]) => [key, exactBoolean(item, `post_deploy_public_loader_${key}_invalid`)])),
  }
  const normalizeProvider = (item, code) => {
    if (item === null) return null
    exactKeys(item, ['statusCode', 'javascript', 'signature'], code)
    return {
      statusCode: nullableStatusCode(item.statusCode, `${code}_status`),
      javascript: exactBoolean(item.javascript, `${code}_javascript`),
      signature: exactBoolean(item.signature, `${code}_signature`),
    }
  }
  const normalizeProviderRuntime = (providerRuntime, surface) => {
    exactKeys(providerRuntime, ['expected', 'webAnalytics', 'speedInsights'], `post_deploy_${surface}_provider_runtime_invalid`)
    const expected = exactBoolean(providerRuntime.expected, `post_deploy_${surface}_provider_runtime_expected_invalid`)
    if (expected !== (stage === 'production')) fail(`post_deploy_${surface}_provider_runtime_stage_mismatch`)
    const normalized = {
      expected,
      webAnalytics: normalizeProvider(providerRuntime.webAnalytics, `post_deploy_${surface}_web_analytics_runtime_invalid`),
      speedInsights: normalizeProvider(providerRuntime.speedInsights, `post_deploy_${surface}_speed_insights_runtime_invalid`),
    }
    if (stage === 'preview' && (normalized.webAnalytics !== null || normalized.speedInsights !== null)) {
      fail(`post_deploy_${surface}_preview_provider_runtime_unexpected`)
    }
    if (stage === 'production' && (!normalized.webAnalytics || !normalized.speedInsights)) {
      fail(`post_deploy_${surface}_production_provider_runtime_missing`)
    }
    return normalized
  }
  const normalized = {
    release: {
      public: normalizeReleaseProbe(value.release.public, 'post_deploy_public_release_probe_invalid'),
      app: normalizeReleaseProbe(value.release.app, 'post_deploy_app_release_probe_invalid'),
    },
    health: {
      public: normalizeHealthProbe(value.health.public, 'post_deploy_public_health_probe_invalid'),
      app: normalizeHealthProbe(value.health.app, 'post_deploy_app_health_probe_invalid'),
    },
    publicHome: normalizeHtmlProbe(value.publicHome, 'public-home', '/', 'post_deploy_public_home_probe_invalid'),
    routes: PRODUCT_ROUTES.map(([id, path], index) => normalizeHtmlProbe(value.routes[index], id, path, `post_deploy_${id}_route_probe_invalid`)),
    observability: {
      loader: normalizedLoader,
      publicLoader: normalizedPublicLoader,
      providerRuntime: normalizeProviderRuntime(value.observability.providerRuntime, 'app'),
      publicProviderRuntime: normalizeProviderRuntime(value.observability.publicProviderRuntime, 'public'),
    },
  }
  return normalized
}

function gate(id, blockers) {
  return { id, status: blockers.length ? 'blocked' : 'pass', blockers }
}

function evidenceFresh(timestamp, generatedAt) {
  const age = Date.parse(generatedAt) - Date.parse(timestamp)
  return age >= -60_000 && age <= MAX_EVIDENCE_AGE_MS
}

function deriveOperations(context, probes, runtimeEnvelope, rollbackEnvelope, publicObservabilityEnvelope, publicObservabilityAttestationEnvelope) {
  const releaseBlockers = []
  const expectedRelease = [
    ['public', probes.release.public, 'supermega-public-site'],
    ['app', probes.release.app, 'supermega-app'],
  ]
  for (const [surface, proof, service] of expectedRelease) {
    if (proof.statusCode !== 200) releaseBlockers.push(`${surface}_release_http_not_200`)
    if (!proof.jsonValid || !proof.responseSafe) releaseBlockers.push(`${surface}_release_response_invalid`)
    if (proof.service !== service) releaseBlockers.push(`${surface}_release_service_mismatch`)
    if (proof.commit !== context.expectedCommit) releaseBlockers.push(`${surface}_release_commit_mismatch`)
  }
  if (probes.release.app.canonicalDomain !== 'https://app.supermega.dev') releaseBlockers.push('app_release_canonical_domain_mismatch')

  const healthBlockers = []
  const publicHealth = probes.health.public
  if (publicHealth.statusCode !== 200 || !publicHealth.jsonValid || !publicHealth.responseSafe) healthBlockers.push('public_health_response_invalid')
  if (publicHealth.service !== 'supermega-public-site' || publicHealth.status !== 'ready' || publicHealth.ok !== true
    || publicHealth.commit !== context.expectedCommit) healthBlockers.push('public_health_contract_mismatch')
  const appHealth = probes.health.app
  if (appHealth.statusCode !== 200 || !appHealth.jsonValid || !appHealth.responseSafe) healthBlockers.push('app_health_response_invalid')
  if (!appHealth.commit) healthBlockers.push('app_health_commit_missing')
  else if (appHealth.commit !== context.expectedCommit) healthBlockers.push('app_health_commit_mismatch')
  if (appHealth.service !== 'supermega-service' || appHealth.status !== 'ready'
    || appHealth.operatingMode !== 'isolated_demo' || appHealth.enterpriseDbReady !== false
    || appHealth.securityReady !== true || appHealth.writeEnabled !== false
    || appHealth.browserServiceRoleExposed !== false || appHealth.activationEvidenceReady !== false
    || appHealth.secretValuesExposed !== false) healthBlockers.push('app_health_isolated_demo_contract_mismatch')

  const routeBlockers = []
  if (probes.publicHome.statusCode !== 200 || !probes.publicHome.html || !probes.publicHome.observabilityBootstrap
    || !probes.publicHome.responseSafe) routeBlockers.push('public_home_invalid')
  const requiredPublicHeaders = [
    'contentSecurityPolicyPresent', 'scriptSourcesRestricted', 'frameAncestorsNone', 'sensitiveCapabilitiesDenied',
    'referrerNoReferrer', 'noSniff', 'frameDenied',
  ]
  if (requiredPublicHeaders.some((key) => probes.publicHome.headers[key] !== true)) {
    routeBlockers.push('public_home_security_headers_invalid')
  }
  for (const route of probes.routes) {
    if (route.statusCode !== 200 || !route.html || !route.appShell || !route.observabilityBootstrap || !route.responseSafe) {
      routeBlockers.push(`${route.id}_route_shell_invalid`)
    }
    if (Object.values(route.headers).some((value) => value !== true)) routeBlockers.push(`${route.id}_security_headers_invalid`)
  }

  const loader = probes.observability.loader
  const appWebAnalyticsDeliveryBlockers = []
  if (loader.statusCode !== 200 || !loader.javascript || !loader.responseSafe || !loader.productionHostGuard
    || !loader.analyticsQueue || !loader.webAnalyticsBootstrap || !loader.sameOriginOnly) {
    appWebAnalyticsDeliveryBlockers.push('app_web_analytics_bootstrap_invalid')
  }
  if (context.stage === 'production') {
    const runtime = probes.observability.providerRuntime.webAnalytics
    if (runtime?.statusCode !== 200 || runtime.javascript !== true || runtime.signature !== true) {
      appWebAnalyticsDeliveryBlockers.push('app_web_analytics_provider_script_unavailable')
    }
  }
  const appSpeedInsightsDeliveryBlockers = []
  if (loader.statusCode !== 200 || !loader.javascript || !loader.responseSafe || !loader.productionHostGuard
    || !loader.speedInsightsQueue || !loader.speedInsightsBootstrap || !loader.sameOriginOnly) {
    appSpeedInsightsDeliveryBlockers.push('app_speed_insights_bootstrap_invalid')
  }
  if (context.stage === 'production') {
    const runtime = probes.observability.providerRuntime.speedInsights
    if (runtime?.statusCode !== 200 || runtime.javascript !== true || runtime.signature !== true) {
      appSpeedInsightsDeliveryBlockers.push('app_speed_insights_provider_script_unavailable')
    }
  }

  const publicLoader = probes.observability.publicLoader
  const publicWebAnalyticsDeliveryBlockers = []
  if (publicLoader.statusCode !== 200 || !publicLoader.javascript || !publicLoader.responseSafe
    || !publicLoader.exactProductionHosts || !publicLoader.canonicalPathAllowlist
    || !publicLoader.analyticsQueue || !publicLoader.analyticsBeforeSendFirst || !publicLoader.pageviewsOnly
    || !publicLoader.queryAndHashStripped || !publicLoader.webAnalyticsBootstrap || !publicLoader.sameOriginOnly
    || publicLoader.sourcePresenceObservedTelemetry !== false) {
    publicWebAnalyticsDeliveryBlockers.push('public_web_analytics_source_contract_invalid')
  }
  const publicSpeedInsightsDeliveryBlockers = []
  if (publicLoader.statusCode !== 200 || !publicLoader.javascript || !publicLoader.responseSafe
    || !publicLoader.exactProductionHosts || !publicLoader.canonicalPathAllowlist
    || !publicLoader.speedInsightsQueue || !publicLoader.speedInsightsBeforeSendFirst || !publicLoader.coreWebVitalsOnly
    || !publicLoader.queryAndHashStripped || !publicLoader.speedInsightsBootstrap || !publicLoader.sameOriginOnly
    || publicLoader.sourcePresenceObservedTelemetry !== false) {
    publicSpeedInsightsDeliveryBlockers.push('public_speed_insights_source_contract_invalid')
  }
  if (context.stage === 'production') {
    const analyticsRuntime = probes.observability.publicProviderRuntime.webAnalytics
    if (analyticsRuntime?.statusCode !== 200 || analyticsRuntime.javascript !== true || analyticsRuntime.signature !== true) {
      publicWebAnalyticsDeliveryBlockers.push('public_web_analytics_provider_script_unavailable')
    }
    const speedRuntime = probes.observability.publicProviderRuntime.speedInsights
    if (speedRuntime?.statusCode !== 200 || speedRuntime.javascript !== true || speedRuntime.signature !== true) {
      publicSpeedInsightsDeliveryBlockers.push('public_speed_insights_provider_script_unavailable')
    }
  }

  const runtimeLogBlockers = []
  if (!runtimeEnvelope) runtimeLogBlockers.push('runtime_log_receipt_missing')
  else {
    const runtime = runtimeEnvelope.receipt
    if (!evidenceFresh(runtime.window.endedAt, context.generatedAt)) runtimeLogBlockers.push('runtime_log_receipt_stale')
    if (Date.parse(runtime.window.endedAt) - Date.parse(runtime.window.startedAt) > MAX_RUNTIME_WINDOW_MS) {
      runtimeLogBlockers.push('runtime_log_window_unbounded')
    }
    if (runtime.errorCount !== 0) runtimeLogBlockers.push('runtime_errors_observed')
    if (runtime.materialWarningCount !== 0) runtimeLogBlockers.push('material_runtime_warnings_observed')
  }

  const rollbackBlockers = []
  if (!rollbackEnvelope) rollbackBlockers.push('rollback_receipt_missing')
  else {
    const rollback = rollbackEnvelope.receipt
    if (!evidenceFresh(rollback.capturedAt, context.generatedAt)) rollbackBlockers.push('rollback_receipt_stale')
    for (const target of rollback.targets) {
      if (target.readyState !== 'READY' || target.target !== 'production') rollbackBlockers.push(`${target.surface}_rollback_target_not_ready`)
      if (target.commit === context.expectedCommit) rollbackBlockers.push(`${target.surface}_rollback_points_to_candidate`)
    }
    if (rollback.targets[0].commit !== rollback.targets[1].commit) rollbackBlockers.push('paired_rollback_commit_mismatch')
  }

  const gates = [
    gate('paired_release_identity', releaseBlockers),
    gate('truthful_isolated_demo_health', healthBlockers),
    gate('four_route_security_headers', routeBlockers),
    gate('app_web_analytics_delivery_ready', appWebAnalyticsDeliveryBlockers),
    gate('app_speed_insights_delivery_ready', appSpeedInsightsDeliveryBlockers),
    gate('public_web_analytics_delivery_ready', publicWebAnalyticsDeliveryBlockers),
    gate('public_speed_insights_delivery_ready', publicSpeedInsightsDeliveryBlockers),
    gate('runtime_error_scan', runtimeLogBlockers),
    gate('paired_rollback_readiness', rollbackBlockers),
  ]
  if (context.stage === 'production') {
    const publicWebAnalyticsVisibilityBlockers = []
    const publicSpeedInsightsVisibilityBlockers = []
    if (!publicObservabilityEnvelope) {
      publicWebAnalyticsVisibilityBlockers.push('public_observability_visibility_receipt_missing')
      publicSpeedInsightsVisibilityBlockers.push('public_observability_visibility_receipt_missing')
    } else {
      const visibility = publicObservabilityEnvelope.receipt
      if (!evidenceFresh(visibility.capturedAt, context.generatedAt)
        || !evidenceFresh(visibility.window.endedAt, context.generatedAt)) {
        publicWebAnalyticsVisibilityBlockers.push('public_observability_visibility_receipt_stale')
        publicSpeedInsightsVisibilityBlockers.push('public_observability_visibility_receipt_stale')
      }
      if (!publicObservabilityAttestationEnvelope) {
        publicWebAnalyticsVisibilityBlockers.push('public_observability_owner_attestation_missing')
        publicSpeedInsightsVisibilityBlockers.push('public_observability_owner_attestation_missing')
      } else {
        const attestation = publicObservabilityAttestationEnvelope.receipt
        if (!evidenceFresh(attestation.reviewedAt, context.generatedAt)) {
          publicWebAnalyticsVisibilityBlockers.push('public_observability_owner_attestation_stale')
          publicSpeedInsightsVisibilityBlockers.push('public_observability_owner_attestation_stale')
        }
        if (attestation.reviewOutcome !== 'accept') {
          publicWebAnalyticsVisibilityBlockers.push('public_observability_owner_attestation_rejected')
          publicSpeedInsightsVisibilityBlockers.push('public_observability_owner_attestation_rejected')
        }
      }
      if (visibility.webAnalytics.status !== 'observed') publicWebAnalyticsVisibilityBlockers.push('public_web_analytics_not_observed')
      if (visibility.speedInsights.status !== 'observed') publicSpeedInsightsVisibilityBlockers.push('public_speed_insights_not_observed')
    }
    gates.push(gate('public_web_analytics_provider_visibility_owner_attested', publicWebAnalyticsVisibilityBlockers))
    gates.push(gate('public_speed_insights_provider_visibility_owner_attested', publicSpeedInsightsVisibilityBlockers))
  }
  const blockers = [...new Set(gates.flatMap((item) => item.blockers))]
  return {
    status: blockers.length ? 'blocked' : 'pass',
    blockingCount: blockers.length,
    blockers,
    gates,
  }
}

function externalReleaseGates() {
  return {
    status: 'blocked',
    blockingCount: 2,
    blockers: ['exact_four_route_rendered_preview_not_evaluated', 'owner_release_approval_not_granted'],
    gates: [
      gate('exact_four_route_rendered_preview', ['not_evaluated_by_operations_receipt']),
      gate('owner_release_approval', ['not_granted_by_operations_receipt']),
    ],
  }
}

function withDigest(body) {
  return { ...body, digest: digest(JSON.stringify(body)) }
}

export function buildPostDeployOperationsReceipt({
  generatedAt = new Date().toISOString(),
  stage,
  expectedCommit,
  publicOrigin,
  appOrigin,
  probes,
  runtimeLogEvidence = null,
  runtimeLogSourceDigest = null,
  rollbackEvidence = null,
  rollbackSourceDigest = null,
  publicObservabilityVisibilityEvidence = null,
  publicObservabilityVisibilitySourceDigest = null,
  publicObservabilityVisibilityAttestation = null,
  publicObservabilityVisibilityAttestationSourceDigest = null,
}) {
  const context = normalizeContext({ generatedAt, stage, expectedCommit, publicOrigin, appOrigin })
  const normalizedProbes = normalizeProbes(probes, context.stage)
  const runtimeLogs = evidenceEnvelope(runtimeLogEvidence, runtimeLogSourceDigest, normalizeRuntimeLogEvidence, context, 'post_deploy_runtime_logs')
  const rollback = evidenceEnvelope(rollbackEvidence, rollbackSourceDigest, normalizeRollbackEvidence, context, 'post_deploy_rollback')
  const publicObservability = evidenceEnvelope(
    publicObservabilityVisibilityEvidence,
    publicObservabilityVisibilitySourceDigest,
    normalizePublicObservabilityVisibilityEvidence,
    context,
    'post_deploy_public_observability',
  )
  const publicObservabilityAttestation = publicObservabilityAttestationEnvelope(
    publicObservabilityVisibilityAttestation,
    publicObservabilityVisibilityAttestationSourceDigest,
    context,
    publicObservability,
  )
  const operations = deriveOperations(
    context,
    normalizedProbes,
    runtimeLogs,
    rollback,
    publicObservability,
    publicObservabilityAttestation,
  )
  const body = {
    contract: POST_DEPLOY_OPERATIONS_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: context.generatedAt,
    mode: 'read_only_get',
    stage: context.stage,
    expectedCommit: context.expectedCommit,
    deploymentOrigins: { public: context.publicOrigin, app: context.appOrigin },
    probes: normalizedProbes,
    evidence: { runtimeLogs, rollback, publicObservability, publicObservabilityAttestation },
    operations,
    externalReleaseGates: externalReleaseGates(),
    releaseAuthorized: false,
    controls: {
      requestMethods: ['GET'],
      credentialsSent: false,
      redirectsFollowed: false,
      providerWritesPerformed: false,
      hostedWritesPerformed: false,
      databaseConnectionsPerformed: false,
      credentialChangesPerformed: false,
      customerContactPerformed: false,
      paymentsPerformed: false,
      stockMovementPerformed: false,
      managedActivationPerformed: false,
    },
    doesNotAuthorize: [
      'push', 'pull_request', 'merge', 'workflow_dispatch', 'deployment', 'promotion', 'rollback',
      'domain_change', 'environment_change', 'database_write', 'credential_change', 'customer_contact',
      'payment', 'stock_movement', 'managed_activation',
    ],
  }
  assertNoPrivateOrSecretShape(body, 'post_deploy_receipt_private_or_secret_shape')
  return withDigest(body)
}

function withoutDigest(packet) {
  const body = { ...packet }
  delete body.digest
  return body
}

export function validatePostDeployOperationsReceipt(packet) {
  exactKeys(packet, [
    'contract', 'digestScope', 'generatedAt', 'mode', 'stage', 'expectedCommit', 'deploymentOrigins',
    'probes', 'evidence', 'operations', 'externalReleaseGates', 'releaseAuthorized', 'controls',
    'doesNotAuthorize', 'digest',
  ], 'post_deploy_receipt_shape_invalid')
  if (packet.contract !== POST_DEPLOY_OPERATIONS_CONTRACT
    || packet.digestScope !== 'utf8_compact_json_without_digest'
    || packet.mode !== 'read_only_get' || packet.releaseAuthorized !== false) fail('post_deploy_receipt_contract_invalid')
  const context = normalizeContext({
    generatedAt: packet.generatedAt,
    stage: packet.stage,
    expectedCommit: packet.expectedCommit,
    publicOrigin: packet.deploymentOrigins?.public,
    appOrigin: packet.deploymentOrigins?.app,
  })
  exactKeys(packet.deploymentOrigins, ['public', 'app'], 'post_deploy_receipt_origins_shape_invalid')
  const probes = normalizeProbes(packet.probes, context.stage)
  exactKeys(packet.evidence, [
    'runtimeLogs', 'rollback', 'publicObservability', 'publicObservabilityAttestation',
  ], 'post_deploy_receipt_evidence_shape_invalid')
  const normalizeStoredEnvelope = (value, normalizer, code) => {
    if (value === null) return null
    exactKeys(value, ['sourceDigest', 'receipt'], `${code}_shape_invalid`)
    return {
      sourceDigest: exactDigest(value.sourceDigest, `${code}_digest_invalid`),
      receipt: normalizer(value.receipt, context),
    }
  }
  const runtimeLogs = normalizeStoredEnvelope(packet.evidence.runtimeLogs, normalizeRuntimeLogEvidence, 'post_deploy_stored_runtime_logs')
  const rollback = normalizeStoredEnvelope(packet.evidence.rollback, normalizeRollbackEvidence, 'post_deploy_stored_rollback')
  const publicObservability = normalizeStoredEnvelope(
    packet.evidence.publicObservability,
    normalizePublicObservabilityVisibilityEvidence,
    'post_deploy_stored_public_observability',
  )
  const publicObservabilityAttestation = packet.evidence.publicObservabilityAttestation === null
    ? null
    : (() => {
        exactKeys(packet.evidence.publicObservabilityAttestation, ['sourceDigest', 'receipt'], 'post_deploy_stored_public_observability_attestation_shape_invalid')
        return {
          sourceDigest: exactDigest(
            packet.evidence.publicObservabilityAttestation.sourceDigest,
            'post_deploy_stored_public_observability_attestation_digest_invalid',
          ),
          receipt: normalizePublicObservabilityVisibilityAttestation(
            packet.evidence.publicObservabilityAttestation.receipt,
            context,
            publicObservability,
          ),
        }
      })()
  const operations = deriveOperations(
    context,
    probes,
    runtimeLogs,
    rollback,
    publicObservability,
    publicObservabilityAttestation,
  )
  if (JSON.stringify(packet.operations) !== JSON.stringify(operations)) fail('post_deploy_operations_derived_state_mismatch')
  const external = externalReleaseGates()
  if (JSON.stringify(packet.externalReleaseGates) !== JSON.stringify(external)) fail('post_deploy_external_gates_mismatch')
  const expectedControls = {
    requestMethods: ['GET'], credentialsSent: false, redirectsFollowed: false,
    providerWritesPerformed: false, hostedWritesPerformed: false, databaseConnectionsPerformed: false,
    credentialChangesPerformed: false, customerContactPerformed: false, paymentsPerformed: false,
    stockMovementPerformed: false, managedActivationPerformed: false,
  }
  if (JSON.stringify(packet.controls) !== JSON.stringify(expectedControls)) fail('post_deploy_controls_invalid')
  const expectedDoesNotAuthorize = [
    'push', 'pull_request', 'merge', 'workflow_dispatch', 'deployment', 'promotion', 'rollback',
    'domain_change', 'environment_change', 'database_write', 'credential_change', 'customer_contact',
    'payment', 'stock_movement', 'managed_activation',
  ]
  if (JSON.stringify(packet.doesNotAuthorize) !== JSON.stringify(expectedDoesNotAuthorize)) fail('post_deploy_authority_boundary_invalid')
  if (packet.digest !== digest(JSON.stringify(withoutDigest(packet)))) fail('post_deploy_receipt_digest_mismatch')
  assertNoPrivateOrSecretShape(packet, 'post_deploy_receipt_private_or_secret_shape')
  return packet
}

async function readEvidence(path, code) {
  if (!path) return { value: null, sourceDigest: null }
  const text = await readFile(resolve(path), 'utf8')
  if (Buffer.byteLength(text, 'utf8') < 2 || Buffer.byteLength(text, 'utf8') > MAX_EVIDENCE_BYTES) fail(`${code}_file_invalid`)
  let value
  try {
    value = JSON.parse(text)
  } catch {
    fail(`${code}_json_invalid`)
  }
  assertNoPrivateOrSecretShape(value, `${code}_private_or_secret_shape`)
  return { value, sourceDigest: digest(text) }
}

async function writeExclusive(path, content) {
  const absolute = resolve(String(path || ''))
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' })
  return absolute
}

function parseArgs(argv) {
  const options = {
    verifyPath: null,
    expectedCommit: null,
    stage: null,
    publicOrigin: null,
    appOrigin: null,
    runtimeLogReceipt: null,
    rollbackReceipt: null,
    publicObservabilityVisibilityReceipt: null,
    publicObservabilityVisibilityAttestation: null,
    outputPath: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--verify') options.verifyPath = argv[++index] || null
    else if (arg === '--expected-commit') options.expectedCommit = argv[++index] || null
    else if (arg === '--stage') options.stage = argv[++index] || null
    else if (arg === '--public-origin') options.publicOrigin = argv[++index] || null
    else if (arg === '--app-origin') options.appOrigin = argv[++index] || null
    else if (arg === '--runtime-log-receipt') options.runtimeLogReceipt = argv[++index] || null
    else if (arg === '--rollback-receipt') options.rollbackReceipt = argv[++index] || null
    else if (arg === '--public-observability-visibility-receipt') options.publicObservabilityVisibilityReceipt = argv[++index] || null
    else if (arg === '--public-observability-visibility-attestation') options.publicObservabilityVisibilityAttestation = argv[++index] || null
    else if (arg === '--output') options.outputPath = argv[++index] || null
    else fail(`post_deploy_usage_invalid:${arg}`)
  }
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.verifyPath) {
    const packet = validatePostDeployOperationsReceipt(JSON.parse(await readFile(resolve(options.verifyPath), 'utf8')))
    console.log(JSON.stringify({
      ok: true,
      contract: packet.contract,
      stage: packet.stage,
      expectedCommit: packet.expectedCommit,
      operationsStatus: packet.operations.status,
      blockingCount: packet.operations.blockingCount,
      releaseAuthorized: false,
      digest: packet.digest,
      providerWritesPerformed: false,
    }, null, 2))
    return
  }
  for (const [field, code] of [
    ['expectedCommit', 'post_deploy_expected_commit_required'],
    ['stage', 'post_deploy_stage_required'],
    ['publicOrigin', 'post_deploy_public_origin_required'],
    ['appOrigin', 'post_deploy_app_origin_required'],
    ['outputPath', 'post_deploy_output_required'],
  ]) if (!options[field]) fail(code)
  const context = normalizeContext({
    generatedAt: new Date().toISOString(),
    stage: options.stage,
    expectedCommit: options.expectedCommit,
    publicOrigin: options.publicOrigin,
    appOrigin: options.appOrigin,
  })
  const runtime = await readEvidence(options.runtimeLogReceipt, 'post_deploy_runtime_log_receipt')
  const rollback = await readEvidence(options.rollbackReceipt, 'post_deploy_rollback_receipt')
  const publicObservability = await readEvidence(options.publicObservabilityVisibilityReceipt, 'post_deploy_public_observability_visibility_receipt')
  const publicObservabilityAttestation = await readEvidence(
    options.publicObservabilityVisibilityAttestation,
    'post_deploy_public_observability_visibility_attestation',
  )
  const probes = await collectPostDeployProbes({
    stage: context.stage,
    publicOrigin: context.publicOrigin,
    appOrigin: context.appOrigin,
  })
  const packet = buildPostDeployOperationsReceipt({
    ...context,
    probes,
    runtimeLogEvidence: runtime.value,
    runtimeLogSourceDigest: runtime.sourceDigest,
    rollbackEvidence: rollback.value,
    rollbackSourceDigest: rollback.sourceDigest,
    publicObservabilityVisibilityEvidence: publicObservability.value,
    publicObservabilityVisibilitySourceDigest: publicObservability.sourceDigest,
    publicObservabilityVisibilityAttestation: publicObservabilityAttestation.value,
    publicObservabilityVisibilityAttestationSourceDigest: publicObservabilityAttestation.sourceDigest,
  })
  validatePostDeployOperationsReceipt(packet)
  const output = await writeExclusive(options.outputPath, `${JSON.stringify(packet, null, 2)}\n`)
  console.log(JSON.stringify({
    ok: packet.operations.status === 'pass',
    contract: packet.contract,
    output,
    stage: packet.stage,
    expectedCommit: packet.expectedCommit,
    operationsStatus: packet.operations.status,
    blockingCount: packet.operations.blockingCount,
    blockers: packet.operations.blockers,
    releaseAuthorized: false,
    digest: packet.digest,
    providerWritesPerformed: false,
  }, null, 2))
  if (packet.operations.status !== 'pass') process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: POST_DEPLOY_OPERATIONS_CONTRACT,
      error: String(error?.message || 'post_deploy_operations_failed').slice(0, 240),
      releaseAuthorized: false,
      providerWritesPerformed: false,
    }, null, 2))
    process.exitCode = 1
  })
}

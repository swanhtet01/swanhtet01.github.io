#!/usr/bin/env node

import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  POST_DEPLOY_OPERATIONS_CONTRACT,
  validatePostDeployOperationsReceipt,
} from './collect_post_deploy_operations_receipt.mjs'
import {
  assertEvidenceDirectoryReady,
  buildEvidenceDescriptor,
  collectGitSourceState,
  sha256Digest,
} from './rendered_proof_provenance.mjs'
import {
  Cdp,
  findBrowser,
  launchBrowser,
  verifyCase,
} from './verify_app_entry_rendered.mjs'

export const EXACT_APP_PREVIEW_CONTRACT = 'supermega.exact-app-preview-rendered.v1'
export const EXACT_APP_PREVIEW_VALIDATION_CONTRACT = 'supermega.exact-app-preview-validation.v1'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const verifierPath = fileURLToPath(import.meta.url)
const browserHarnessPath = resolve(root, 'tools', 'verify_app_entry_rendered.mjs')
const MAX_JSON_BYTES = 2 * 1024 * 1024
const MAX_SCREENSHOT_BYTES = 20 * 1024 * 1024
const MAX_RELEASE_BYTES = 64 * 1024
const MAX_OPERATIONS_AGE_MS = 2 * 60 * 60 * 1000
const RELEASE_TIMEOUT_MS = 15_000
const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/
const SAFE_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const SECRET_PATTERN = /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|vercel_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/
const PRIVATE_PATH_PATTERN = /(?:[A-Z]:\\Users\\|\/Users\/|\/home\/|OneDrive - )/iu
const CREDENTIAL_URL_PATTERN = /https?:\/\/[^/\s:@]+:[^/\s@]+@/iu
const PNG_SIGNATURE = Object.freeze([137, 80, 78, 71, 13, 10, 26, 10])
const PRODUCTION_HOSTS = new Set([
  'supermega.dev',
  'www.supermega.dev',
  'app.supermega.dev',
  'supermega-public.vercel.app',
  'megaos.vercel.app',
])

export const EXACT_APP_PREVIEW_CASE_MATRIX = Object.freeze([
  { id: 'public_desktop', surface: 'public', route: '/', width: 1280, height: 900, mobile: false, screenshot: 'public-home-desktop-1280x900.png' },
  { id: 'public_mobile', surface: 'public', route: '/', width: 390, height: 844, mobile: true, screenshot: 'public-home-mobile-390x844.png' },
  { id: 'shop_desktop', surface: 'shop', route: '/shop/?template=mini-mart', width: 1280, height: 900, mobile: false, screenshot: 'shop-counter-mini-mart-desktop-1280x900.png' },
  { id: 'shop_mobile', surface: 'shop', route: '/shop/?template=mini-mart', width: 390, height: 844, mobile: true, screenshot: 'shop-counter-mini-mart-mobile-390x844.png' },
  { id: 'plant_desktop', surface: 'plant', route: '/plant/', width: 1280, height: 900, mobile: false, screenshot: 'plant-working-sample-desktop-1280x900.png' },
  { id: 'plant_mobile', surface: 'plant', route: '/plant/', width: 390, height: 844, mobile: true, screenshot: 'plant-working-sample-mobile-390x844.png' },
  { id: 'website_desktop', surface: 'website', route: '/website/', width: 1280, height: 900, mobile: false, screenshot: 'website-working-sample-desktop-1280x900.png' },
  { id: 'website_mobile', surface: 'website', route: '/website/', width: 390, height: 844, mobile: true, screenshot: 'website-working-sample-mobile-390x844.png' },
  { id: 'ecommerce_desktop', surface: 'ecommerce', route: '/ecommerce/', width: 1280, height: 900, mobile: false, screenshot: 'ecommerce-local-request-desktop-1280x900.png' },
  { id: 'ecommerce_mobile', surface: 'ecommerce', route: '/ecommerce/', width: 390, height: 844, mobile: true, screenshot: 'ecommerce-local-request-mobile-390x844.png' },
])

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function exactKeys(value, keys, code) {
  if (!isRecord(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code)
}

function exactSha(value, code) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!SHA_PATTERN.test(normalized)) fail(code)
  return normalized
}

function exactDigest(value, code) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!DIGEST_PATTERN.test(normalized)) fail(code)
  return normalized
}

function exactTimestamp(value, code) {
  const normalized = String(value || '').trim()
  if (!TIMESTAMP_PATTERN.test(normalized) || Number.isNaN(Date.parse(normalized))
    || new Date(normalized).toISOString() !== normalized) fail(code)
  return normalized
}

function safeFile(value, code) {
  const normalized = String(value || '').trim()
  if (!SAFE_FILE_PATTERN.test(normalized) || normalized === '.' || normalized === '..') fail(code)
  return normalized
}

function exactPositiveInteger(value, maximum, code) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) fail(code)
  return value
}

function assertNoPrivateOrSecretShape(value, code) {
  const serialized = JSON.stringify(value)
  if (SECRET_PATTERN.test(serialized) || PRIVATE_PATH_PATTERN.test(serialized)
    || CREDENTIAL_URL_PATTERN.test(serialized)) fail(code)
}

function normalizePreviewOrigin(value, code) {
  let parsed
  try {
    parsed = new URL(String(value || '').trim())
  } catch {
    fail(code)
  }
  const hostname = parsed.hostname.toLowerCase()
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
    || parsed.pathname !== '/' || parsed.search || parsed.hash
    || !hostname.endsWith('.vercel.app') || PRODUCTION_HOSTS.has(hostname)) fail(code)
  return `https://${hostname}`
}

async function readBoundedReleaseBody(response) {
  if (!response.body || typeof response.body.getReader !== 'function') fail('exact_app_preview_release_body_invalid')
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!(value instanceof Uint8Array)) fail('exact_app_preview_release_chunk_invalid')
      total += value.byteLength
      if (total > MAX_RELEASE_BYTES) {
        await reader.cancel().catch(() => {})
        fail('exact_app_preview_release_body_too_large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const payload = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    payload.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(payload)
}

async function probeReleaseSurface(fetchImpl, origin, surface, expectedCommit) {
  let response
  try {
    response = await fetchImpl(new URL('/__release.json', origin), {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'cache-control': 'no-cache, no-store',
        pragma: 'no-cache',
        'user-agent': 'SuperMegaExactAppPreview/1.0',
      },
      signal: AbortSignal.timeout(RELEASE_TIMEOUT_MS),
    })
  } catch {
    fail(`exact_app_preview_release_probe_unavailable:${surface}`)
  }
  if (response.status !== 200 || response.redirected === true || response.headers.has('location')) {
    fail(`exact_app_preview_release_redirect_or_status_invalid:${surface}`)
  }
  if (!/application\/json/i.test(response.headers.get('content-type') || '')) {
    fail(`exact_app_preview_release_content_type_invalid:${surface}`)
  }
  let body
  try {
    body = JSON.parse(await readBoundedReleaseBody(response))
  } catch (error) {
    if (String(error?.message || '').startsWith('exact_app_preview_')) throw error
    fail(`exact_app_preview_release_json_invalid:${surface}`)
  }
  if (!isRecord(body)) fail(`exact_app_preview_release_json_invalid:${surface}`)
  const expectedService = surface === 'public' ? 'supermega-public-site' : 'supermega-app'
  if (body.service !== expectedService
    || exactSha(body.commit, `exact_app_preview_release_commit_invalid:${surface}`) !== expectedCommit
    || (surface === 'app' && body.canonicalDomain !== 'https://app.supermega.dev')) {
    fail(`exact_app_preview_release_identity_mismatch:${surface}`)
  }
  return {
    origin,
    statusCode: 200,
    service: expectedService,
    commit: expectedCommit,
    canonicalDomain: surface === 'app' ? 'https://app.supermega.dev' : null,
  }
}

export async function probeExactPairedReleaseIdentity({
  publicOrigin,
  appOrigin,
  expectedCommit,
  fetchImpl = fetch,
}) {
  const commit = exactSha(expectedCommit, 'exact_app_preview_release_expected_commit_invalid')
  const origins = {
    public: normalizePreviewOrigin(publicOrigin, 'exact_app_preview_release_public_origin_invalid'),
    app: normalizePreviewOrigin(appOrigin, 'exact_app_preview_release_app_origin_invalid'),
  }
  return {
    public: await probeReleaseSurface(fetchImpl, origins.public, 'public', commit),
    app: await probeReleaseSurface(fetchImpl, origins.app, 'app', commit),
  }
}

function gatePassed(packet, name) {
  const gate = packet.operations?.gates?.find((entry) => entry?.id === name)
  return gate?.status === 'pass' && Array.isArray(gate.blockers) && gate.blockers.length === 0
}

function normalizeOperationsBinding(packetValue, fileDigest, generatedAt) {
  const packet = validatePostDeployOperationsReceipt(packetValue)
  if (packet.stage !== 'preview' || packet.operations.status !== 'pass'
    || packet.operations.blockingCount !== 0 || packet.operations.blockers.length !== 0) {
    fail('exact_app_preview_operations_not_passed')
  }
  for (const name of [
    'paired_release_identity',
    'truthful_isolated_demo_health',
    'four_route_security_headers',
    'app_web_analytics_delivery_ready',
    'app_speed_insights_delivery_ready',
    'public_web_analytics_delivery_ready',
    'public_speed_insights_delivery_ready',
    'runtime_error_scan',
    'paired_rollback_readiness',
  ]) if (!gatePassed(packet, name)) fail(`exact_app_preview_operations_gate_invalid:${name}`)
  if (!packet.probes.routes.every((route) => route.headers?.cameraSelf === true)) {
    fail('exact_app_preview_camera_policy_invalid')
  }
  const publicOrigin = normalizePreviewOrigin(packet.deploymentOrigins.public, 'exact_app_preview_public_origin_invalid')
  const appOrigin = normalizePreviewOrigin(packet.deploymentOrigins.app, 'exact_app_preview_app_origin_invalid')
  if (publicOrigin === appOrigin) fail('exact_app_preview_origins_not_distinct')
  const operationsGeneratedAt = exactTimestamp(packet.generatedAt, 'exact_app_preview_operations_time_invalid')
  const proofTime = Date.parse(generatedAt)
  const operationsTime = Date.parse(operationsGeneratedAt)
  if (operationsTime > proofTime + 60_000 || proofTime - operationsTime > MAX_OPERATIONS_AGE_MS) {
    fail('exact_app_preview_operations_stale')
  }
  return {
    packet,
    binding: {
      contract: POST_DEPLOY_OPERATIONS_CONTRACT,
      fileDigest: exactDigest(fileDigest, 'exact_app_preview_operations_file_digest_invalid'),
      packetDigest: exactDigest(packet.digest, 'exact_app_preview_operations_packet_digest_invalid'),
      generatedAt: operationsGeneratedAt,
      expectedCommit: packet.expectedCommit,
      publicOrigin,
      appOrigin,
      status: 'pass',
    },
  }
}

function normalizeVerifierSource(value) {
  exactKeys(value, ['commit', 'tree', 'clean'], 'exact_app_preview_verifier_source_shape_invalid')
  if (value.clean !== true) fail('exact_app_preview_verifier_source_not_clean')
  return {
    commit: exactSha(value.commit, 'exact_app_preview_verifier_source_commit_invalid'),
    tree: exactSha(value.tree, 'exact_app_preview_verifier_source_tree_invalid'),
    clean: true,
  }
}

function normalizeTool(value, expectedPath, code) {
  exactKeys(value, ['path', 'digest', 'bytes'], `${code}_shape_invalid`)
  if (value.path !== expectedPath) fail(`${code}_path_invalid`)
  return {
    path: expectedPath,
    digest: exactDigest(value.digest, `${code}_digest_invalid`),
    bytes: exactPositiveInteger(value.bytes, MAX_JSON_BYTES, `${code}_bytes_invalid`),
  }
}

function normalizeVerifierBinding(value) {
  exactKeys(value, ['source', 'verifier', 'browserHarness'], 'exact_app_preview_verifier_binding_shape_invalid')
  return {
    source: normalizeVerifierSource(value.source),
    verifier: normalizeTool(value.verifier, 'tools/verify_exact_app_preview.mjs', 'exact_app_preview_verifier'),
    browserHarness: normalizeTool(value.browserHarness, 'tools/verify_app_entry_rendered.mjs', 'exact_app_preview_browser_harness'),
  }
}

function normalizeReleaseSurface(value, surface, origin, expectedCommit) {
  exactKeys(value, ['origin', 'statusCode', 'service', 'commit', 'canonicalDomain'], `exact_app_preview_release_evidence_shape_invalid:${surface}`)
  const expectedService = surface === 'public' ? 'supermega-public-site' : 'supermega-app'
  const canonicalDomain = surface === 'app' ? 'https://app.supermega.dev' : null
  if (value.origin !== origin || value.statusCode !== 200 || value.service !== expectedService
    || value.canonicalDomain !== canonicalDomain
    || exactSha(value.commit, `exact_app_preview_release_evidence_commit_invalid:${surface}`) !== expectedCommit) {
    fail(`exact_app_preview_release_evidence_mismatch:${surface}`)
  }
  return { origin, statusCode: 200, service: expectedService, commit: expectedCommit, canonicalDomain }
}

function normalizeReleaseIdentityEvidence(value, operations, expectedCommit) {
  exactKeys(value, ['before', 'after'], 'exact_app_preview_release_evidence_invalid')
  const normalizePair = (pair, phase) => {
    exactKeys(pair, ['public', 'app'], `exact_app_preview_release_evidence_pair_invalid:${phase}`)
    return {
      public: normalizeReleaseSurface(pair.public, 'public', operations.publicOrigin, expectedCommit),
      app: normalizeReleaseSurface(pair.app, 'app', operations.appOrigin, expectedCommit),
    }
  }
  const normalized = {
    before: normalizePair(value.before, 'before'),
    after: normalizePair(value.after, 'after'),
  }
  if (JSON.stringify(normalized.before) !== JSON.stringify(normalized.after)) {
    fail('exact_app_preview_release_identity_changed_during_proof')
  }
  return normalized
}

export async function collectCurrentVerifierBinding() {
  const [verifierPayload, harnessPayload] = await Promise.all([
    readFile(verifierPath),
    readFile(browserHarnessPath),
  ])
  return {
    source: collectGitSourceState(root),
    verifier: {
      path: 'tools/verify_exact_app_preview.mjs',
      digest: sha256Digest(verifierPayload),
      bytes: verifierPayload.byteLength,
    },
    browserHarness: {
      path: 'tools/verify_app_entry_rendered.mjs',
      digest: sha256Digest(harnessPayload),
      bytes: harnessPayload.byteLength,
    },
  }
}

function normalizeEvidence(value) {
  exactKeys(value, ['directory', 'report'], 'exact_app_preview_evidence_shape_invalid')
  if (value.directory !== '.') fail('exact_app_preview_evidence_directory_invalid')
  const report = safeFile(value.report, 'exact_app_preview_evidence_report_invalid')
  if (!report.toLowerCase().endsWith('.json')) fail('exact_app_preview_evidence_report_invalid')
  return { directory: '.', report }
}

function exactShopResolvedPath(value) {
  let parsed
  try {
    parsed = new URL(String(value || ''), 'https://preview.invalid')
  } catch {
    return false
  }
  const keys = [...parsed.searchParams.keys()]
  return parsed.origin === 'https://preview.invalid'
    && parsed.pathname === '/shop/'
    && parsed.hash === ''
    && keys.length === 2
    && new Set(keys).size === 2
    && parsed.searchParams.getAll('tab').length === 1
    && parsed.searchParams.get('tab') === 'counter'
    && parsed.searchParams.getAll('template').length === 1
    && parsed.searchParams.get('template') === 'mini-mart'
}

function expectedResolvedPath(spec, value) {
  if (spec.surface === 'shop') return exactShopResolvedPath(value)
  return value === spec.route
}

function normalizeBrowserCase(value, spec, expectedOrigin) {
  if (!isRecord(value) || value.name !== spec.id || value.route !== spec.route
    || value.viewport !== `${spec.width}x${spec.height}${spec.mobile ? ' mobile' : ''}`
    || value.origin !== expectedOrigin
    || value.hash !== ''
    || !expectedResolvedPath(spec, String(value.path || ''))
    || value.browserContextIsolated !== true
    || value.ok !== true || !Array.isArray(value.failures) || value.failures.length !== 0) {
    fail(`exact_app_preview_case_invalid:${spec.id}`)
  }
  if (!Number.isInteger(value.bodyLength) || value.bodyLength < 1 || value.bodyLength > 2_000_000) {
    fail(`exact_app_preview_case_body_invalid:${spec.id}`)
  }
  exactKeys(value.runtime, ['clean', 'errors'], `exact_app_preview_case_runtime_shape_invalid:${spec.id}`)
  if (value.runtime.clean !== true || !Array.isArray(value.runtime.errors) || value.runtime.errors.length !== 0) {
    fail(`exact_app_preview_case_runtime_invalid:${spec.id}`)
  }
  exactKeys(value.network, ['mutatingRequestCount', 'mutatingRequests'], `exact_app_preview_case_network_shape_invalid:${spec.id}`)
  if (value.network.mutatingRequestCount !== 0 || !Array.isArray(value.network.mutatingRequests)
    || value.network.mutatingRequests.length !== 0) fail(`exact_app_preview_browser_write_observed:${spec.id}`)
  exactKeys(value.screenshot, ['file', 'bytes', 'digest'], `exact_app_preview_case_screenshot_shape_invalid:${spec.id}`)
  if (value.screenshot.file !== spec.screenshot) fail(`exact_app_preview_case_screenshot_file_invalid:${spec.id}`)
  const screenshot = {
    file: spec.screenshot,
    bytes: exactPositiveInteger(value.screenshot.bytes, MAX_SCREENSHOT_BYTES, `exact_app_preview_case_screenshot_bytes_invalid:${spec.id}`),
    digest: exactDigest(value.screenshot.digest, `exact_app_preview_case_screenshot_digest_invalid:${spec.id}`),
  }
  if (spec.surface === 'shop' && (value.layout?.ok !== true || value.layout?.aboveFold !== true
    || value.layout?.accessibility?.ok !== true)) fail(`exact_app_preview_shop_flow_invalid:${spec.id}`)
  if (spec.surface === 'ecommerce' && value.claimBoundary?.ok !== true) {
    fail(`exact_app_preview_ecommerce_claim_invalid:${spec.id}`)
  }
  const primaryFlow = spec.surface === 'shop'
    ? 'counter_checkout_ready_above_fold'
    : spec.surface === 'ecommerce'
      ? 'browser_local_request_boundary_visible'
      : spec.surface === 'plant'
        ? 'sample_timeline_boundary_visible'
        : spec.surface === 'website'
          ? 'local_not_deployed_boundary_visible'
          : 'product_entry_visible'
  return {
    id: spec.id,
    surface: spec.surface,
    route: spec.route,
    renderedOrigin: expectedOrigin,
    renderedHash: '',
    resolvedPath: value.path,
    viewport: { width: spec.width, height: spec.height, mobile: spec.mobile },
    bodyLength: value.bodyLength,
    primaryFlow,
    screenshot,
    browserContextIsolated: true,
    noHorizontalOverflow: true,
    runtimeClean: true,
    mutatingRequestCount: 0,
    passed: true,
  }
}

function normalizeStoredCase(value, spec, expectedOrigin) {
  exactKeys(value, [
    'id', 'surface', 'route', 'renderedOrigin', 'renderedHash', 'resolvedPath', 'viewport', 'bodyLength', 'primaryFlow',
    'screenshot', 'browserContextIsolated', 'noHorizontalOverflow', 'runtimeClean',
    'mutatingRequestCount', 'passed',
  ], `exact_app_preview_stored_case_shape_invalid:${spec.id}`)
  exactKeys(value.viewport, ['width', 'height', 'mobile'], `exact_app_preview_stored_viewport_shape_invalid:${spec.id}`)
  const synthetic = {
    name: value.id,
    route: value.route,
    origin: value.renderedOrigin,
    hash: value.renderedHash,
    viewport: `${value.viewport.width}x${value.viewport.height}${value.viewport.mobile ? ' mobile' : ''}`,
    path: value.resolvedPath,
    bodyLength: value.bodyLength,
    layout: spec.surface === 'shop' ? { ok: true, aboveFold: true, accessibility: { ok: true } } : null,
    claimBoundary: spec.surface === 'ecommerce' ? { ok: true } : null,
    screenshot: value.screenshot,
    browserContextIsolated: value.browserContextIsolated,
    network: { mutatingRequestCount: value.mutatingRequestCount, mutatingRequests: [] },
    runtime: { clean: value.runtimeClean, errors: [] },
    ok: value.passed,
    failures: [],
  }
  const normalized = normalizeBrowserCase(synthetic, spec, expectedOrigin)
  if (JSON.stringify(value) !== JSON.stringify(normalized)) fail(`exact_app_preview_stored_case_mismatch:${spec.id}`)
  return normalized
}

function assertUniqueScreenshots(cases) {
  const files = cases.map((entry) => entry.screenshot.file)
  const digests = cases.map((entry) => entry.screenshot.digest)
  if (new Set(files).size !== cases.length || new Set(digests).size !== cases.length) {
    fail('exact_app_preview_screenshot_identity_duplicate')
  }
}

function validateScreenshotPayloads(cases, screenshotPayloads) {
  if (!(screenshotPayloads instanceof Map) || screenshotPayloads.size !== cases.length) {
    fail('exact_app_preview_screenshot_payloads_incomplete')
  }
  for (const entry of cases) {
    const payload = screenshotPayloads.get(entry.screenshot.file)
    if (!(payload instanceof Uint8Array) || payload.byteLength < 1024
      || payload.byteLength > MAX_SCREENSHOT_BYTES
      || PNG_SIGNATURE.some((byte, index) => payload[index] !== byte)) {
      fail(`exact_app_preview_screenshot_payload_invalid:${entry.id}`)
    }
    if (payload.byteLength !== entry.screenshot.bytes
      || sha256Digest(payload) !== entry.screenshot.digest) {
      fail(`exact_app_preview_screenshot_payload_mismatch:${entry.id}`)
    }
  }
}

function expectedGates() {
  return {
    technicalRenderedPreviewPassed: true,
    releaseIdentityBound: true,
    publicDesktopMobileRendered: true,
    shopCounterDesktopMobilePassed: true,
    plantDesktopMobileRendered: true,
    websiteDesktopMobileRendered: true,
    ecommerceClaimDesktopMobilePassed: true,
    cameraPolicyPassed: true,
    noBrowserMutatingRequests: true,
    manualVisualAcceptanceRequired: true,
    exactPreviewAccepted: false,
    releaseAuthorized: false,
  }
}

function expectedControls() {
  return {
    freshEphemeralBrowserProfile: true,
    isolatedCaseBrowserContexts: true,
    syntheticBrowserStateOnly: true,
    operationsReceiptMode: 'read_only_get',
    browserMutatingRequestsObserved: 0,
    manualVisualInspectionPerformed: false,
    providerMutationRequestsIssued: false,
    hostedMutationRequestsObserved: 0,
    databaseWriteRequestsIssued: false,
    customerContactRequestsIssued: false,
    paymentRequestsIssued: false,
    stockMovementRequestsIssued: false,
    managedActivationRequestsIssued: false,
  }
}

function expectedBlockers() {
  return [
    'independent_manual_visual_acceptance_missing',
    'owner_release_approval_not_granted',
  ]
}

function withoutDigest(value) {
  const body = { ...value }
  delete body.digest
  return body
}

export function buildExactAppPreviewReport({
  generatedAt,
  expectedCommit,
  verifierHead,
  operationsPacket,
  operationsFileDigest,
  provenance,
  browserHarness,
  releaseIdentity,
  evidence,
  browser,
  cases,
}) {
  const normalizedGeneratedAt = exactTimestamp(generatedAt, 'exact_app_preview_generated_at_invalid')
  if (Date.parse(normalizedGeneratedAt) > Date.now() + 5 * 60 * 1000) fail('exact_app_preview_generated_at_future')
  const commit = exactSha(expectedCommit, 'exact_app_preview_expected_commit_invalid')
  const operations = normalizeOperationsBinding(operationsPacket, operationsFileDigest, normalizedGeneratedAt)
  if (operations.binding.expectedCommit !== commit) fail('exact_app_preview_operations_commit_mismatch')
  const exactVerifierHead = exactSha(verifierHead, 'exact_app_preview_verifier_head_invalid')
  exactKeys(provenance, ['source', 'verifier'], 'exact_app_preview_provenance_shape_invalid')
  const verifierSource = normalizeVerifierSource(provenance.source)
  if (verifierSource.commit !== exactVerifierHead) fail('exact_app_preview_verifier_head_mismatch')
  const verifier = normalizeTool(provenance.verifier, 'tools/verify_exact_app_preview.mjs', 'exact_app_preview_verifier')
  const harness = normalizeTool(browserHarness, 'tools/verify_app_entry_rendered.mjs', 'exact_app_preview_browser_harness')
  const releases = normalizeReleaseIdentityEvidence(releaseIdentity, operations.binding, commit)
  if (!Array.isArray(cases) || cases.length !== EXACT_APP_PREVIEW_CASE_MATRIX.length) {
    fail('exact_app_preview_case_matrix_invalid')
  }
  const normalizedCases = EXACT_APP_PREVIEW_CASE_MATRIX.map((spec, index) => normalizeBrowserCase(
    cases[index],
    spec,
    spec.surface === 'public' ? operations.binding.publicOrigin : operations.binding.appOrigin,
  ))
  assertUniqueScreenshots(normalizedCases)
  const browserValue = String(browser || '').trim()
  if (!/^[A-Za-z][A-Za-z0-9 ._/-]{1,79}$/.test(browserValue)) fail('exact_app_preview_browser_invalid')
  const body = {
    contract: EXACT_APP_PREVIEW_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: normalizedGeneratedAt,
    expectedCommit: commit,
    target: {
      kind: 'vercel_preview',
      publicOrigin: operations.binding.publicOrigin,
      appOrigin: operations.binding.appOrigin,
    },
    operationsReceipt: operations.binding,
    releaseIdentity: releases,
    verifierSource,
    verifier,
    browserHarness: harness,
    evidence: normalizeEvidence(evidence),
    browser: browserValue,
    cases: normalizedCases,
    checks: normalizedCases.length,
    runtime: { clean: true, errorCount: 0, mutatingRequestCount: 0 },
    gates: expectedGates(),
    blockers: expectedBlockers(),
    releaseAuthorized: false,
    controls: expectedControls(),
  }
  assertNoPrivateOrSecretShape(body, 'exact_app_preview_private_or_secret_shape')
  return { ...body, digest: sha256Digest(JSON.stringify(body)) }
}

export function validateExactAppPreviewReport({
  report,
  operationsPacket,
  operationsFileDigest,
  expectedCommit,
  expectedVerifierHead,
  verifierBinding,
  screenshotPayloads,
}) {
  exactKeys(report, [
    'contract', 'digestScope', 'generatedAt', 'expectedCommit', 'target', 'operationsReceipt',
    'releaseIdentity', 'verifierSource', 'verifier', 'browserHarness', 'evidence', 'browser', 'cases', 'checks',
    'runtime', 'gates', 'blockers', 'releaseAuthorized', 'controls', 'digest',
  ], 'exact_app_preview_report_shape_invalid')
  if (report.contract !== EXACT_APP_PREVIEW_CONTRACT
    || report.digestScope !== 'utf8_compact_json_without_digest'
    || report.releaseAuthorized !== false) fail('exact_app_preview_report_contract_invalid')
  const generatedAt = exactTimestamp(report.generatedAt, 'exact_app_preview_generated_at_invalid')
  const commit = exactSha(report.expectedCommit, 'exact_app_preview_expected_commit_invalid')
  if (commit !== exactSha(expectedCommit, 'exact_app_preview_expected_commit_required')) {
    fail('exact_app_preview_expected_commit_mismatch')
  }
  const operations = normalizeOperationsBinding(operationsPacket, operationsFileDigest, generatedAt)
  if (operations.binding.expectedCommit !== commit
    || JSON.stringify(report.operationsReceipt) !== JSON.stringify(operations.binding)) {
    fail('exact_app_preview_operations_binding_mismatch')
  }
  exactKeys(report.target, ['kind', 'publicOrigin', 'appOrigin'], 'exact_app_preview_target_shape_invalid')
  const target = {
    kind: report.target.kind,
    publicOrigin: normalizePreviewOrigin(report.target.publicOrigin, 'exact_app_preview_public_origin_invalid'),
    appOrigin: normalizePreviewOrigin(report.target.appOrigin, 'exact_app_preview_app_origin_invalid'),
  }
  if (target.kind !== 'vercel_preview'
    || target.publicOrigin !== operations.binding.publicOrigin
    || target.appOrigin !== operations.binding.appOrigin) fail('exact_app_preview_target_mismatch')
  const verifierSource = normalizeVerifierSource(report.verifierSource)
  if (verifierSource.commit !== exactSha(expectedVerifierHead, 'exact_app_preview_verifier_head_required')) {
    fail('exact_app_preview_verifier_head_mismatch')
  }
  const verifier = normalizeTool(report.verifier, 'tools/verify_exact_app_preview.mjs', 'exact_app_preview_verifier')
  const harness = normalizeTool(report.browserHarness, 'tools/verify_app_entry_rendered.mjs', 'exact_app_preview_browser_harness')
  const currentVerifier = normalizeVerifierBinding(verifierBinding)
  if (JSON.stringify(currentVerifier.source) !== JSON.stringify(verifierSource)
    || JSON.stringify(currentVerifier.verifier) !== JSON.stringify(verifier)
    || JSON.stringify(currentVerifier.browserHarness) !== JSON.stringify(harness)) {
    fail('exact_app_preview_current_verifier_binding_mismatch')
  }
  const releases = normalizeReleaseIdentityEvidence(report.releaseIdentity, operations.binding, commit)
  const evidence = normalizeEvidence(report.evidence)
  const browser = String(report.browser || '').trim()
  if (!/^[A-Za-z][A-Za-z0-9 ._/-]{1,79}$/.test(browser)) fail('exact_app_preview_browser_invalid')
  if (!Array.isArray(report.cases) || report.cases.length !== EXACT_APP_PREVIEW_CASE_MATRIX.length) {
    fail('exact_app_preview_case_matrix_invalid')
  }
  const cases = EXACT_APP_PREVIEW_CASE_MATRIX.map((spec, index) => normalizeStoredCase(
    report.cases[index],
    spec,
    spec.surface === 'public' ? operations.binding.publicOrigin : operations.binding.appOrigin,
  ))
  assertUniqueScreenshots(cases)
  validateScreenshotPayloads(cases, screenshotPayloads)
  if (report.checks !== cases.length) fail('exact_app_preview_check_count_invalid')
  const runtime = { clean: true, errorCount: 0, mutatingRequestCount: 0 }
  if (JSON.stringify(report.runtime) !== JSON.stringify(runtime)) fail('exact_app_preview_runtime_invalid')
  const gates = expectedGates()
  const blockers = expectedBlockers()
  const controls = expectedControls()
  if (JSON.stringify(report.gates) !== JSON.stringify(gates)) fail('exact_app_preview_gates_invalid')
  if (JSON.stringify(report.blockers) !== JSON.stringify(blockers)) fail('exact_app_preview_blockers_invalid')
  if (JSON.stringify(report.controls) !== JSON.stringify(controls)) fail('exact_app_preview_controls_invalid')
  const normalized = {
    contract: EXACT_APP_PREVIEW_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt,
    expectedCommit: commit,
    target,
    operationsReceipt: operations.binding,
    releaseIdentity: releases,
    verifierSource,
    verifier,
    browserHarness: harness,
    evidence,
    browser,
    cases,
    checks: cases.length,
    runtime,
    gates,
    blockers,
    releaseAuthorized: false,
    controls,
  }
  if (JSON.stringify(withoutDigest(report)) !== JSON.stringify(normalized)) fail('exact_app_preview_report_normalization_mismatch')
  const digest = exactDigest(report.digest, 'exact_app_preview_report_digest_invalid')
  if (digest !== sha256Digest(JSON.stringify(normalized))) fail('exact_app_preview_report_digest_mismatch')
  assertNoPrivateOrSecretShape(report, 'exact_app_preview_private_or_secret_shape')
  return {
    contract: EXACT_APP_PREVIEW_VALIDATION_CONTRACT,
    expectedCommit: commit,
    verifierCommit: verifierSource.commit,
    technicalRenderedPreviewPassed: true,
    screenshots: cases.map((entry) => entry.screenshot),
    operationsReceiptDigest: operations.binding.packetDigest,
    reportDigest: digest,
    manualVisualAcceptanceRequired: true,
    exactPreviewAccepted: false,
    releaseAuthorized: false,
  }
}

export function parseExactAppPreviewArgs(argv = []) {
  const options = {
    verifyPath: null,
    expectedCommit: null,
    verifierHead: null,
    operationsReceiptPath: null,
    outputPath: null,
    screenshotDir: null,
    chromium: null,
  }
  const seen = new Set()
  const fields = new Map([
    ['--verify', 'verifyPath'],
    ['--expected-commit', 'expectedCommit'],
    ['--verifier-head', 'verifierHead'],
    ['--operations-receipt', 'operationsReceiptPath'],
    ['--out', 'outputPath'],
    ['--screenshot-dir', 'screenshotDir'],
    ['--chromium', 'chromium'],
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const field = fields.get(arg)
    if (!field || seen.has(arg)) fail('exact_app_preview_arguments_invalid')
    seen.add(arg)
    const value = argv[++index]
    if (!value || value.startsWith('--')) fail('exact_app_preview_arguments_invalid')
    options[field] = value
  }
  const required = options.verifyPath
    ? ['verifyPath', 'expectedCommit', 'verifierHead', 'operationsReceiptPath']
    : ['expectedCommit', 'verifierHead', 'operationsReceiptPath', 'outputPath', 'screenshotDir']
  if (required.some((field) => !options[field])) fail('exact_app_preview_arguments_required')
  if (options.verifyPath && (options.outputPath || options.screenshotDir || options.chromium)) {
    fail('exact_app_preview_verify_arguments_invalid')
  }
  return options
}

async function readBoundedJson(path, code) {
  const absolute = resolve(String(path || ''))
  const metadata = await lstat(absolute).catch(() => null)
  if (!metadata?.isFile() || metadata.isSymbolicLink() || metadata.size < 2 || metadata.size > MAX_JSON_BYTES) fail(`${code}_file_invalid`)
  const payload = await readFile(absolute)
  let value
  try {
    value = JSON.parse(payload.toString('utf8'))
  } catch {
    fail(`${code}_json_invalid`)
  }
  return { absolute, payload, value, digest: sha256Digest(payload) }
}

async function readScreenshotPayloads(report, reportPath) {
  if (basename(reportPath) !== report?.evidence?.report) fail('exact_app_preview_report_file_binding_mismatch')
  const evidenceDirectory = dirname(reportPath)
  const payloads = new Map()
  for (const spec of EXACT_APP_PREVIEW_CASE_MATRIX) {
    const screenshotPath = resolve(evidenceDirectory, spec.screenshot)
    if (dirname(screenshotPath) !== evidenceDirectory) fail('exact_app_preview_screenshot_path_invalid')
    const metadata = await lstat(screenshotPath).catch(() => null)
    if (!metadata?.isFile() || metadata.isSymbolicLink()
      || metadata.size < 1024 || metadata.size > MAX_SCREENSHOT_BYTES) {
      fail(`exact_app_preview_screenshot_file_invalid:${spec.id}`)
    }
    payloads.set(spec.screenshot, await readFile(screenshotPath))
  }
  return payloads
}

function expectedPath(spec) {
  if (spec.surface === 'shop') return exactShopResolvedPath
  return spec.route
}

function expectedText(spec) {
  if (spec.surface === 'public') return ['Pick one product and try the working sample.', 'Choose a product']
  if (spec.surface === 'shop') return ['Mini-mart & grocery', 'Tap an item to add it', 'Premium rice 25kg', 'LOCAL DEMO']
  if (spec.surface === 'plant') return ['Plant', 'working sample', "These dates belong to this browser-local sample, not today's production."]
  if (spec.surface === 'website') return ['Website', 'Make this website yours', 'Nothing has been deployed.']
  return ['Ecommerce', 'Try one customer order', 'Start sample order']
}

function browserCase(spec, origin) {
  return {
    name: spec.id,
    route: spec.route,
    width: spec.width,
    height: spec.height,
    mobile: spec.mobile,
    expectedOrigin: origin,
    expectedPath: expectedPath(spec),
    expectedPathLabel: spec.surface === 'shop' ? '/shop/?tab=counter&template=mini-mart' : spec.route,
    expectedText: expectedText(spec),
    exerciseShopCounter: spec.surface === 'shop',
    exerciseEcommerceClaimBoundary: spec.surface === 'ecommerce',
    isolatedBrowserContext: true,
    noHorizontalOverflow: true,
    screenshotName: spec.screenshot.replace(/\.png$/i, ''),
    timeoutMs: 60_000,
    seed: {},
  }
}

async function main() {
  const options = parseExactAppPreviewArgs(process.argv.slice(2))
  const operations = await readBoundedJson(options.operationsReceiptPath, 'exact_app_preview_operations_receipt')
  if (options.verifyPath) {
    const report = await readBoundedJson(options.verifyPath, 'exact_app_preview_report')
    const screenshotPayloads = await readScreenshotPayloads(report.value, report.absolute)
    const verifierBinding = await collectCurrentVerifierBinding()
    const validation = validateExactAppPreviewReport({
      report: report.value,
      operationsPacket: operations.value,
      operationsFileDigest: operations.digest,
      expectedCommit: options.expectedCommit,
      expectedVerifierHead: options.verifierHead,
      verifierBinding,
      screenshotPayloads,
    })
    console.log(JSON.stringify({ ok: true, ...validation }, null, 2))
    return
  }
  const generatedAt = new Date().toISOString()
  const operationsBinding = normalizeOperationsBinding(operations.value, operations.digest, generatedAt)
  const expectedCommit = exactSha(options.expectedCommit, 'exact_app_preview_expected_commit_required')
  const verifierHead = exactSha(options.verifierHead, 'exact_app_preview_verifier_head_required')
  if (operationsBinding.binding.expectedCommit !== expectedCommit) fail('exact_app_preview_operations_commit_mismatch')
  const evidence = buildEvidenceDescriptor({ evidenceDir: options.screenshotDir, outputPath: options.outputPath })
  await assertEvidenceDirectoryReady(options.screenshotDir)
  const verifierBefore = await collectCurrentVerifierBinding()
  if (verifierBefore.source.commit !== verifierHead) fail('exact_app_preview_verifier_head_mismatch')
  await mkdir(resolve(options.screenshotDir), { recursive: true })
  const browserBin = findBrowser()
  const userDataDir = await mkdtemp(resolve(tmpdir(), 'supermega-exact-preview-'))
  let browserProcess = null
  let cdp = null
  try {
    const launched = await launchBrowser(browserBin, userDataDir)
    browserProcess = launched.browser
    cdp = await Cdp.connect(launched.wsUrl)
    const version = await cdp.send('Browser.getVersion')
    const releaseBefore = await probeExactPairedReleaseIdentity({
      publicOrigin: operationsBinding.binding.publicOrigin,
      appOrigin: operationsBinding.binding.appOrigin,
      expectedCommit,
    })
    const cases = []
    for (const spec of EXACT_APP_PREVIEW_CASE_MATRIX) {
      const origin = spec.surface === 'public'
        ? operationsBinding.binding.publicOrigin
        : operationsBinding.binding.appOrigin
      cases.push(await verifyCase(cdp, origin, browserCase(spec, origin)))
    }
    const releaseAfter = await probeExactPairedReleaseIdentity({
      publicOrigin: operationsBinding.binding.publicOrigin,
      appOrigin: operationsBinding.binding.appOrigin,
      expectedCommit,
    })
    const verifierAfter = await collectCurrentVerifierBinding()
    if (JSON.stringify(verifierBefore) !== JSON.stringify(verifierAfter)) {
      fail('exact_app_preview_verifier_changed_during_proof')
    }
    const operationsAfter = await readBoundedJson(options.operationsReceiptPath, 'exact_app_preview_operations_receipt')
    if (operationsAfter.digest !== operations.digest) fail('exact_app_preview_operations_changed_during_proof')
    const report = buildExactAppPreviewReport({
      generatedAt,
      expectedCommit,
      verifierHead,
      operationsPacket: operationsAfter.value,
      operationsFileDigest: operationsAfter.digest,
      provenance: { source: verifierBefore.source, verifier: verifierBefore.verifier },
      browserHarness: verifierBefore.browserHarness,
      releaseIdentity: { before: releaseBefore, after: releaseAfter },
      evidence,
      browser: version.product,
      cases,
    })
    const screenshotPayloads = await readScreenshotPayloads(report, resolve(options.outputPath))
    const validation = validateExactAppPreviewReport({
      report,
      operationsPacket: operationsAfter.value,
      operationsFileDigest: operationsAfter.digest,
      expectedCommit,
      expectedVerifierHead: verifierHead,
      verifierBinding: verifierAfter,
      screenshotPayloads,
    })
    const serialized = `${JSON.stringify(report, null, 2)}\n`
    await writeFile(resolve(options.outputPath), serialized, { encoding: 'utf8', flag: 'wx' })
    console.log(JSON.stringify({ ok: true, output: resolve(options.outputPath), ...validation }, null, 2))
  } finally {
    if (cdp) {
      await cdp.send('Browser.close').catch(() => {})
      await cdp.close().catch(() => {})
    }
    browserProcess?.kill()
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: EXACT_APP_PREVIEW_CONTRACT,
      error: String(error?.message || 'exact_app_preview_failed').slice(0, 240),
      exactPreviewAccepted: false,
      releaseAuthorized: false,
      providerMutationRequestsIssued: false,
    }, null, 2))
    process.exitCode = 1
  })
}

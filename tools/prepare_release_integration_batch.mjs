#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { lstat, mkdir, open, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

export const RELEASE_INTEGRATION_BATCH_CONTRACT = 'supermega.release-integration-batch.v1'
export const IDENTITY_DATA_BATCH = 'identity-data-onboarding'
export const APP_SHELL_BATCH = 'app-shell'
export const ECOMMERCE_BATCH = 'ecommerce'

const root = resolve(import.meta.dirname, '..')
const MAX_SOURCE_BYTES = 2_000_000
const MAX_OUTPUT_BYTES = 1_000_000
const SHA_PATTERN = /^[0-9a-f]{40}$/
const REF_PATTERN = /^(?:HEAD|origin\/main|[0-9a-f]{40}|(?:refs\/heads\/)?(?:agent|codex)\/[a-z0-9][a-z0-9._/-]{0,119})$/

export const IDENTITY_DATA_REQUIREMENTS = [
  {
    id: 'upstream-managed-account-client', authority: 'upstream', file: 'showroom/src/core/managed-trial.ts', tokens: [
      'export type ManagedWorkspaceDirectoryEntry',
      'export type ManagedWorkspaceSignIn',
      'export type ManagedAccountSetup',
      'export type ManagedCompanyBrief',
      'export type ManagedOwnerControlRun',
      'MANAGED_CLIENT_IMPORT_PREFLIGHT_CHECKS',
      'requestManagedPasswordRecovery',
      'beginManagedAccountSetup',
      'discoverManagedWorkspacesForCurrentSession',
      'completeManagedAccountPassword',
      'signInAndDiscoverManagedWorkspaces',
      'completeManagedWorkspaceSignIn',
      'preflightManagedClientImport',
      'loadManagedCompanyBrief',
      'retainManagedCompanyBrief',
      'loadManagedOwnerControlRun',
      'acknowledgeManagedOwnerControlItem',
      'validateManagedContextProfile',
      'retainManagedContextProfile',
    ],
  },
  {
    id: 'upstream-managed-account-server', authority: 'upstream', file: 'supermega_runtime/trial_runtime.py', tokens: [
      'class TrialClientImportApplyPreflightRequest',
      'class TrialCompanyBriefRequest',
      'class TrialCompanyBriefReceiptRequest',
      'class TrialOwnerControlAcknowledgementRequest',
      'class TrialManagedContextValidateRequest',
      'class TrialManagedContextRetainRequest',
      'def _company_brief_context(',
      'def _client_import_apply_preflight_digest(',
      'def _client_import_apply_preflight(',
    ],
  },
  {
    id: 'upstream-managed-account-ui', authority: 'upstream', file: 'showroom/src/core/SettingsPage.tsx', tokens: [
      "import { ManagedContextConsent } from './ManagedContextConsent'",
      'signInAndDiscoverManagedWorkspaces',
      'completeManagedWorkspaceSignIn',
      'loadManagedCompanyBrief',
      'retainManagedCompanyBrief',
    ],
  },
  {
    id: 'upstream-runtime-failure-tests', authority: 'upstream', file: 'tests/test_cloud_runtime.py', tokens: [
      'def test_agent_failures_are_classified_without_persisting_exception_text',
      'def test_error_completion_persists_only_the_safe_failure_contract',
    ],
  },
  {
    id: 'upstream-database-activation-tests', authority: 'upstream', file: 'tests/test_database_activation_contract.py', tokens: [
      'def test_historical_migrations_are_unchanged_and_v7_is_additive',
      'def test_production_activation_binds_tls_checkout_and_live_release_provenance',
      'def test_browser_auth_and_write_enablement_are_complete_and_ordered',
    ],
  },
  {
    id: 'candidate-client-import-context', authority: 'candidate', file: 'showroom/src/core/ClientDataOnboarding.tsx', tokens: [
      'shopIndustryPackId?: ShopIndustryPackId',
      'plantIndustryPackId?: PlantIndustryPackId',
      'onProgress?: (progress: ClientDemoProductProgress)',
      'initiallyOpen?: boolean',
    ],
  },
  {
    id: 'candidate-managed-plant-and-service-client', authority: 'candidate', file: 'showroom/src/core/managed-trial.ts', tokens: [
      'export type ManagedServiceScheduleRecord',
      'managedPlantEquipmentPackageDigest',
      'validateManagedPlantEquipmentImport',
      'applyManagedPlantEquipmentImport',
      'commissionManagedPlantEquipment',
      'saveManagedPlantEquipmentMaintenanceStrategy',
      'loadManagedServiceSchedule',
      'saveManagedServiceSchedule',
    ],
  },
  {
    id: 'candidate-managed-plant-and-service-server', authority: 'candidate', file: 'supermega_runtime/trial_runtime.py', tokens: [
      'def _current_yangon_date()',
      'class TrialPlantEquipmentCommissionRequest',
      'class TrialPlantEquipmentMaintenanceStrategyRequest',
      'class TrialServiceScheduleSaveRequest',
    ],
  },
  {
    id: 'candidate-four-product-setup-ui', authority: 'candidate', file: 'showroom/src/core/SettingsPage.tsx', tokens: [
      'buildClientCapabilityPlan',
      'createClientDemoWorkspace',
      'function changeShopIndustryPack',
      'function changePlantIndustryPack',
      '<ClientDataOnboarding managedIdentity=',
    ],
  },
]

export const APP_SHELL_REQUIREMENTS = [
  {
    id: 'upstream-managed-account-entry', authority: 'upstream', file: 'showroom/src/core/CoreShell.tsx', tokens: [
      'function isStoredSetupProduct',
      'function managedLoginPath(product: string | null)',
      "const sensitiveAccountRoute = location.pathname.startsWith('/account/')",
      'const accountEntryRoute = loginRoute || sensitiveAccountRoute',
      'Company sign in',
      'aria-label="Company sign in"',
      'mobile-account-link',
    ],
  },
  {
    id: 'upstream-managed-account-entry-css', authority: 'upstream', file: 'showroom/src/core/core-app.css', tokens: [
      '.sidebar-foot .account-shell-link',
      '.topbar-meta > a',
    ],
  },
  {
    id: 'upstream-local-consequence-boundary', authority: 'upstream', file: 'showroom/src/core/CoreApp.tsx', tokens: [
      'counter-local-boundary',
      'Browser-local sample only. Completing this records a sample order and sample stock change in this browser.',
      'No payment is captured, no customer is contacted, no server or managed workspace is written, and no real stock is moved.',
      "if (tab === 'production') return <div className=\"operation-module plant-production-module\">",
    ],
  },
  {
    id: 'upstream-action-reachability', authority: 'upstream', file: 'showroom/src/core/core-app.css', tokens: [
      '.shop-counter-module > .shop-counter-surface',
      'scrollbar-gutter: stable',
      '.operations-screen:not(.commerce-screen) .workspace-view',
      '.plant-production-module > .production-view',
      'flex: 0 0 clamp(500px,calc(100svh - 280px),620px)',
    ],
  },
  {
    id: 'upstream-source-backed-command-center', authority: 'upstream', file: 'showroom/src/core/ProductHomeReadiness.tsx', tokens: [
      'summarizeBehaviorPreferences',
      'const productContinuations',
      'loadManagedCompanyBrief',
      'loadManagedOwnerControlRun',
      'acknowledgeManagedOwnerControlItem',
      'aria-label="Ask SuperMega business command center"',
      'Acknowledgement confirms review only. It does not claim resolution or run any product or external action.',
      'Why this answer',
    ],
  },
  {
    id: 'candidate-task-first-four-product-shell', authority: 'candidate', file: 'showroom/src/core/CoreShell.tsx', tokens: [
      'const ProductHomeToday = lazy(',
      'const ProductSystemNavigator = lazy(',
      'function productFromPathname(pathname: string): ClientSolutionId | null',
      "routeProduct ? ' has-system-navigator' : ''",
      'Four products, one operating system. Start with the most important work.',
      '<details className="product-home-setup">',
    ],
  },
  {
    id: 'candidate-responsive-system-navigation', authority: 'candidate', file: 'showroom/src/core/core-app.css', tokens: [
      '.core-main.has-system-navigator',
      '.product-system-navigator > summary',
      '.product-home-setup > summary',
      '@media (max-width: 840px)',
    ],
  },
  {
    id: 'candidate-accountable-ai-readiness', authority: 'candidate', file: 'showroom/src/core/ProductHomeReadiness.tsx', tokens: [
      'aria-label="AI command queue"',
      'aria-label="Enterprise autopilot contract"',
      'Minimal control, accountable execution.',
      'aria-label="Business starter tracks"',
      'aria-label="AI operating tracks"',
      'Separate products, one simple operating model.',
      'aria-label="AI learning cockpit"',
      'aria-label="Launch readiness"',
    ],
  },
  {
    id: 'candidate-product-workflow-depth', authority: 'candidate', file: 'showroom/src/core/CoreApp.tsx', tokens: [
      'function ecommerceOrderAmendmentSummary',
      'Customer contact or delivery details',
      'shop-counter-module',
      'orderAmendmentReview.intent',
    ],
  },
]

export const ECOMMERCE_REQUIREMENTS = [
  {
    id: 'upstream-live-quote-clock', authority: 'upstream', file: 'showroom/src/products/ecommerce/EcommerceBuyingWorkspace.tsx', tokens: [
      'const [quoteClockMs, setQuoteClockMs] = useState(Date.now)',
      'window.setInterval(() => setQuoteClockMs(Date.now()), 1_000)',
      'Date.parse(latestRequest.quote.expiresAt) - quoteClockMs',
      'setQuoteClockMs(quotedAt.getTime())',
    ],
  },
  {
    id: 'upstream-private-company-labels', authority: 'upstream', file: 'showroom/src/products/ecommerce/EcommerceProduct.tsx', tokens: [
      'Already saved for this company as revision',
      'Saved for this company as revision',
      'Managed Shop - connected company',
    ],
  },
  {
    id: 'upstream-progressive-enterprise-controls', authority: 'upstream', file: 'showroom/src/products/ecommerce/EcommerceProduct.tsx', tokens: [
      '<details className="ecommerce-order-import-workspace"',
      'aria-label="Order batch review workspace"',
      'Upload CSV or paste channel orders only when needed.',
      '<details aria-label="Enterprise order controls"',
      'Inbox, payment, delivery, recovery, replies, and activation evidence.',
    ],
  },
  {
    id: 'candidate-governed-active-order-changes', authority: 'candidate', file: 'showroom/src/products/ecommerce/EcommerceBuyingWorkspace.tsx', tokens: [
      'type EcommerceCancellationOutcome',
      'type EcommerceAmendmentStatus',
      'type EcommerceRescheduleStatus',
      'function openAmendmentRequest',
      'function submitAmendmentRequest',
      'function openRescheduleRequest',
      'function submitRescheduleRequest',
      'function submitCancellationRequest',
    ],
  },
  {
    id: 'candidate-governed-after-sale-help', authority: 'candidate', file: 'showroom/src/products/ecommerce/EcommerceBuyingWorkspace.tsx', tokens: [
      'function submitReturnRequest',
      'function submitSupportRequest',
      'function submitCorrectionRequest',
      '<strong>Order help</strong>',
      'pendingReturnIntents',
      'pendingSupportIntents',
      'pendingCorrectionIntents',
    ],
  },
  {
    id: 'candidate-managed-shop-handoff', authority: 'candidate', file: 'showroom/src/products/ecommerce/EcommerceProduct.tsx', tokens: [
      'async function recordManagedBuyingRequest',
      'function openShopDraft',
      'commerce.storefront_request.received',
      'exactRequestIsRetained',
      'managedOrderTimeline',
    ],
  },
  {
    id: 'candidate-order-operations-depth', authority: 'candidate', file: 'showroom/src/products/ecommerce/EcommerceProduct.tsx', tokens: [
      'const lifecyclePaymentAttention',
      'const lifecycleRefundAttention',
      'const requestInboxFilteredRequests',
      'aria-label="Order lifecycle queue"',
      'aria-label="Order lifecycle control"',
      'aria-label="Customer follow-up controls"',
    ],
  },
  {
    id: 'candidate-safe-order-import', authority: 'candidate', file: 'showroom/src/products/ecommerce/EcommerceProduct.tsx', tokens: [
      'function parseOrderImportCsv',
      'function reviewOrderImportBatch',
      'function downloadOrderImportReviewPacket',
      'No order import, customer message, payment, delivery booking, stock move, refund, Shop write, or managed activation ran.',
    ],
  },
]

const BATCH_POLICIES = new Map([
  [IDENTITY_DATA_BATCH, {
    batch: IDENTITY_DATA_BATCH,
    requirements: IDENTITY_DATA_REQUIREMENTS,
    firstAuthority: 'upstream-managed-account-and-database-security',
  }],
  [APP_SHELL_BATCH, {
    batch: APP_SHELL_BATCH,
    requirements: APP_SHELL_REQUIREMENTS,
    firstAuthority: 'upstream-account-consequence-and-source-evidence',
  }],
  [ECOMMERCE_BATCH, {
    batch: ECOMMERCE_BATCH,
    requirements: ECOMMERCE_REQUIREMENTS,
    firstAuthority: 'upstream-private-progressive-and-live-quote-ux',
  }],
].map(([batch, policy]) => [batch, {
  ...policy,
  files: [...new Set(policy.requirements.map((entry) => entry.file))].sort(),
}]))

function fail(reason) {
  throw new Error(reason)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function exactSha(value, reason) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!SHA_PATTERN.test(normalized)) fail(reason)
  return normalized
}

function exactRef(value) {
  const candidate = String(value || '').trim()
  if (!REF_PATTERN.test(candidate)) fail('release_integration_batch_ref_invalid')
  return candidate
}

function exactBatch(value) {
  const batch = String(value || '').trim()
  const policy = BATCH_POLICIES.get(batch)
  if (!policy) fail('release_integration_batch_unknown')
  return policy
}

function exactSources(value, files) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== files.join(',')) fail('release_integration_batch_sources_invalid')
  const sources = {}
  for (const file of files) {
    const source = value[file]
    if (typeof source !== 'string' || Buffer.byteLength(source) < 1 || Buffer.byteLength(source) > MAX_SOURCE_BYTES) {
      fail('release_integration_batch_source_invalid')
    }
    sources[file] = source.replace(/\r\n?/g, '\n')
  }
  return sources
}

function assessSources(value, policy) {
  const sources = exactSources(value, policy.files)
  const requirements = policy.requirements.map((entry) => {
    const missing = entry.tokens.filter((token) => !sources[entry.file].includes(token))
    return {
      id: entry.id,
      authority: entry.authority,
      file: entry.file,
      requiredTokenCount: entry.tokens.length,
      missing,
      passed: missing.length === 0,
    }
  })
  const executableSourceFiles = policy.files.filter((file) => !file.startsWith('tests/'))
  const forbidden = executableSourceFiles.flatMap((file) => /\bYTF\b|Yangon Tyre/i.test(sources[file]) ? [file] : [])
  const authority = Object.fromEntries(['upstream', 'candidate'].map((name) => {
    const rows = requirements.filter((entry) => entry.authority === name)
    return [name, {
      passed: rows.every((entry) => entry.passed),
      requirementCount: rows.length,
      missingTokenCount: rows.reduce((total, entry) => total + entry.missing.length, 0),
    }]
  }))
  return {
    ok: requirements.every((entry) => entry.passed) && forbidden.length === 0,
    contract: RELEASE_INTEGRATION_BATCH_CONTRACT,
    batch: policy.batch,
    authority,
    requirements,
    forbiddenSourceFiles: forbidden,
  }
}

export function assessIdentityDataSources(value) {
  return assessSources(value, exactBatch(IDENTITY_DATA_BATCH))
}

export function assessAppShellSources(value) {
  return assessSources(value, exactBatch(APP_SHELL_BATCH))
}

export function assessEcommerceSources(value) {
  return assessSources(value, exactBatch(ECOMMERCE_BATCH))
}

function exactBlobMap(value, files) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== files.join(',')) fail('release_integration_batch_blobs_invalid')
  return Object.fromEntries(files.map((file) => [file, exactSha(value[file], 'release_integration_batch_blob_invalid')]))
}

function buildComparison(input, policy) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('release_integration_batch_input_invalid')
  const generatedAt = String(input.generatedAt || '')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(generatedAt)
    || new Date(generatedAt).toISOString() !== generatedAt) fail('release_integration_batch_time_invalid')
  const upstreamRef = exactRef(input.upstream?.ref)
  const candidateRef = exactRef(input.candidate?.ref)
  const upstreamCommit = exactSha(input.upstream?.commit, 'release_integration_batch_upstream_invalid')
  const candidateCommit = exactSha(input.candidate?.commit, 'release_integration_batch_candidate_invalid')
  if (upstreamCommit === candidateCommit) fail('release_integration_batch_refs_not_distinct')
  const upstreamAssessment = assessSources(input.upstream?.sources, policy)
  const candidateAssessment = assessSources(input.candidate?.sources, policy)
  const requirementDigest = `sha256:${sha256(JSON.stringify(policy.requirements))}`
  const body = {
    contract: RELEASE_INTEGRATION_BATCH_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt,
    mode: 'owner_review_only_no_source_mutation',
    batch: policy.batch,
    requirements: {
      digest: requirementDigest,
      files: policy.files,
      groups: policy.requirements.map((entry) => ({ id: entry.id, authority: entry.authority, file: entry.file, tokenCount: entry.tokens.length })),
    },
    upstream: {
      ref: upstreamRef,
      commit: upstreamCommit,
      blobs: exactBlobMap(input.upstream?.blobs, policy.files),
      preservesUnion: upstreamAssessment.ok,
      authority: upstreamAssessment.authority,
      missing: upstreamAssessment.requirements.filter((entry) => !entry.passed).map((entry) => ({ id: entry.id, missing: entry.missing })),
      forbiddenSourceFiles: upstreamAssessment.forbiddenSourceFiles,
    },
    candidate: {
      ref: candidateRef,
      commit: candidateCommit,
      blobs: exactBlobMap(input.candidate?.blobs, policy.files),
      preservesUnion: candidateAssessment.ok,
      authority: candidateAssessment.authority,
      missing: candidateAssessment.requirements.filter((entry) => !entry.passed).map((entry) => ({ id: entry.id, missing: entry.missing })),
      forbiddenSourceFiles: candidateAssessment.forbiddenSourceFiles,
    },
    decision: {
      status: upstreamAssessment.ok || candidateAssessment.ok ? 'one_side_preserves_union' : 'manual_union_required',
      resolutionRule: 'preserve_all_upstream_and_candidate_requirements_in_one_tree',
      firstAuthority: policy.firstAuthority,
      acceptanceCommand: policy.batch === IDENTITY_DATA_BATCH
        ? 'npm run release:integration:batch:check -- --tree <integration-ref>'
        : `npm run release:integration:batch:check -- --tree <integration-ref> --batch ${policy.batch}`,
    },
    authority: {
      branchCreationApproved: false,
      conflictResolutionApproved: false,
      mergeApproved: false,
      pushApproved: false,
      deploymentApproved: false,
      remoteWritesPerformed: false,
      sourceFilesModified: false,
      forcePushAllowed: false,
    },
  }
  return { ...body, digest: `sha256:${sha256(JSON.stringify(body))}` }
}

export function buildIdentityDataComparison(input) {
  return buildComparison(input, exactBatch(IDENTITY_DATA_BATCH))
}

export function buildAppShellComparison(input) {
  return buildComparison(input, exactBatch(APP_SHELL_BATCH))
}

export function buildEcommerceComparison(input) {
  return buildComparison(input, exactBatch(ECOMMERCE_BATCH))
}

function validateComparison(packet, policy) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) fail('release_integration_batch_packet_invalid')
  const { digest, ...body } = packet
  if (!/^sha256:[0-9a-f]{64}$/.test(String(digest || ''))
    || digest !== `sha256:${sha256(JSON.stringify(body))}`
    || packet.contract !== RELEASE_INTEGRATION_BATCH_CONTRACT
    || packet.batch !== policy.batch
    || packet.mode !== 'owner_review_only_no_source_mutation'
    || packet.requirements?.digest !== `sha256:${sha256(JSON.stringify(policy.requirements))}`
    || packet.authority?.branchCreationApproved !== false
    || packet.authority?.conflictResolutionApproved !== false
    || packet.authority?.mergeApproved !== false
    || packet.authority?.pushApproved !== false
    || packet.authority?.deploymentApproved !== false
    || packet.authority?.remoteWritesPerformed !== false
    || packet.authority?.sourceFilesModified !== false
    || packet.authority?.forcePushAllowed !== false) fail('release_integration_batch_packet_invalid')
  return packet
}

export function validateIdentityDataComparison(packet) {
  return validateComparison(packet, exactBatch(IDENTITY_DATA_BATCH))
}

export function validateAppShellComparison(packet) {
  return validateComparison(packet, exactBatch(APP_SHELL_BATCH))
}

export function validateEcommerceComparison(packet) {
  return validateComparison(packet, exactBatch(ECOMMERCE_BATCH))
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 16 * 1024 * 1024,
    timeout: 60_000,
    windowsHide: true,
  })
  if (result.error || result.signal || result.status !== 0) fail('release_integration_batch_git_failed')
  return String(result.stdout || '').trimEnd()
}

function readTree(ref, policy) {
  const canonicalRef = exactRef(ref)
  const commit = exactSha(runGit(['rev-parse', `${canonicalRef}^{commit}`]), 'release_integration_batch_commit_invalid')
  const sources = {}
  const blobs = {}
  for (const file of policy.files) {
    blobs[file] = exactSha(runGit(['rev-parse', `${commit}:${file}`]), 'release_integration_batch_blob_invalid')
    sources[file] = runGit(['show', `${commit}:${file}`])
  }
  return { ref: canonicalRef, commit, sources, blobs }
}

export async function writeExclusiveJson(outputPath, packet) {
  const absolute = resolve(outputPath)
  await mkdir(dirname(absolute), { recursive: true })
  const existing = await lstat(absolute).catch(() => null)
  if (existing) fail('release_integration_batch_output_exists')
  const payload = `${JSON.stringify(packet, null, 2)}\n`
  if (Buffer.byteLength(payload) > MAX_OUTPUT_BYTES) fail('release_integration_batch_output_too_large')
  const handle = await open(absolute, 'wx', 0o600)
  try { await handle.writeFile(payload, 'utf8') } finally { await handle.close() }
  return { path: absolute, bytes: Buffer.byteLength(payload), digest: `sha256:${sha256(payload)}`, packetDigest: packet.digest }
}

function parseArgs(argv) {
  const batchIndex = argv.indexOf('--batch')
  const batch = batchIndex >= 0 ? argv[batchIndex + 1] : IDENTITY_DATA_BATCH
  const core = batchIndex >= 0 ? argv.filter((_, index) => index !== batchIndex && index !== batchIndex + 1) : argv
  exactBatch(batch)
  if (core.length === 2 && core[0] === '--tree') return { mode: 'tree', ref: core[1], batch }
  if (core.length === 6 && core[0] === '--output' && core[2] === '--upstream' && core[4] === '--candidate') {
    return { mode: 'prepare', path: core[1], upstream: core[3], candidate: core[5], batch }
  }
  if (core.length === 2 && core[0] === '--verify' && batchIndex < 0) return { mode: 'verify', path: core[1] }
  fail('release_integration_batch_args_invalid')
}

async function prepare(request) {
  const policy = exactBatch(request.batch)
  const packet = buildComparison({
    generatedAt: new Date().toISOString(),
    upstream: readTree(request.upstream, policy),
    candidate: readTree(request.candidate, policy),
  }, policy)
  const receipt = await writeExclusiveJson(request.path, packet)
  return { ok: true, contract: RELEASE_INTEGRATION_BATCH_CONTRACT, mode: packet.mode, ...receipt, decision: packet.decision, authority: packet.authority }
}

async function verify(path) {
  const absolute = resolve(path)
  const metadata = await lstat(absolute).catch(() => null)
  if (!metadata || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > MAX_OUTPUT_BYTES) {
    fail('release_integration_batch_file_invalid')
  }
  const payload = await readFile(absolute, 'utf8')
  if (Buffer.byteLength(payload) !== metadata.size) fail('release_integration_batch_file_changed')
  let packet
  try {
    const parsed = JSON.parse(payload)
    packet = validateComparison(parsed, exactBatch(parsed?.batch))
  } catch (error) {
    if (String(error?.message || '').startsWith('release_integration_batch_')) throw error
    fail('release_integration_batch_packet_invalid')
  }
  const policy = exactBatch(packet.batch)
  const current = buildComparison({
    generatedAt: packet.generatedAt,
    upstream: readTree(packet.upstream.ref, policy),
    candidate: readTree(packet.candidate.ref, policy),
  }, policy)
  if (JSON.stringify(current) !== JSON.stringify(packet)) fail('release_integration_batch_state_changed')
  return { ok: true, contract: RELEASE_INTEGRATION_BATCH_CONTRACT, mode: packet.mode, path: absolute, bytes: metadata.size, digest: `sha256:${sha256(payload)}`, packetDigest: packet.digest, decision: packet.decision, authority: packet.authority }
}

async function main() {
  const request = parseArgs(process.argv.slice(2))
  let result
  if (request.mode === 'tree') {
    const policy = exactBatch(request.batch)
    const tree = readTree(request.ref, policy)
    const assessment = assessSources(tree.sources, policy)
    result = { ...assessment, mode: 'tree_check', ref: tree.ref, commit: tree.commit, blobs: tree.blobs }
    if (!assessment.ok) process.exitCode = 1
  } else if (request.mode === 'prepare') result = await prepare(request)
  else result = await verify(request.path)
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, contract: RELEASE_INTEGRATION_BATCH_CONTRACT, reason: String(error?.message || 'release_integration_batch_failed').slice(0, 160) })}\n`)
    process.exitCode = 1
  })
}

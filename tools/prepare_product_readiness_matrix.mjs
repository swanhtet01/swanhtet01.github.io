#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateManagedPilotReadiness } from '../kernel/managed-pilot-readiness.mjs'
import { validateOperatingActionBoard } from '../kernel/operating-action-board.mjs'
import { validateTechnicalEstate } from './manage_technical_estate.mjs'
import { validateReleaseHandoffPacket } from './prepare_release_handoff.mjs'
import { validateShopPilotDay0ReadinessPacket } from './prepare_shop_pilot_day0_readiness_packet.mjs'

export const PRODUCT_READINESS_MATRIX_CONTRACT = 'supermega.product-readiness-matrix.v1'

const root = resolve(import.meta.dirname, '..')
const PRODUCT_ORDER = Object.freeze(['shop', 'plant', 'website', 'ecommerce'])
const DEFAULT_TECHNICAL_ESTATE = resolve(root, 'hq', 'technical-estate.json')
const DEFAULT_READINESS = resolve(root, 'hq', 'readiness', 'managed-pilot-readiness.json')
const DEFAULT_OPERATING_ACTION_BOARD = resolve(root, 'hq', 'operating-action-board.json')
const MAX_FILE_BYTES = 1_000_000
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/
const SHA_PATTERN = /^[0-9a-f]{40}$/
const SECRET_PATTERN = /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|vercel_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu
const PHONE_PATTERN = /(?<![A-Za-z0-9])(?:\+?95|09)[\s().-]*\d(?:[\s().-]*\d){6,12}(?![A-Za-z0-9])/u
const PRIVATE_PATH_PATTERN = /(?:[A-Z]:\\\\Users\\\\|\/Users\/|\/home\/|OneDrive - )/iu
const FALSE_CONTROL_FIELDS = Object.freeze([
  'externalWritesPerformed',
  'gitRemoteWritesPerformed',
  'githubWritesPerformed',
  'vercelDeploymentsPerformed',
  'supabaseMutationsPerformed',
  'credentialValuesInspected',
  'customerContactPerformed',
  'automaticMessagesSent',
  'paymentOrStockActionPerformed',
  'hostedWritesPerformed',
  'managedActivationPerformed',
  'privateIdentityExposed',
  'localSubagentsStarted',
])

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  fail('product_readiness_matrix_value_invalid')
}

function sha256(value) {
  return createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')
}

function digest(value) {
  return `sha256:${sha256(value)}`
}

function packetDigest(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`
}

function cloneWithoutDigest(value) {
  const copy = { ...value }
  delete copy.digest
  return copy
}

function assertPublicSafe(value, code = 'product_readiness_matrix_private_or_secret_shape') {
  const text = JSON.stringify(value || {})
  if (SECRET_PATTERN.test(text)
    || EMAIL_PATTERN.test(text)
    || PHONE_PATTERN.test(text)
    || PRIVATE_PATH_PATTERN.test(text)
    || /https?:\/\/[^/\s:@]+:[^/\s@]+@/i.test(text)
    || /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/.test(text)) {
    fail(code)
  }
}

function exactTimestamp(value, code) {
  const normalized = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(normalized)
    || new Date(normalized).toISOString() !== normalized) fail(code)
  return normalized
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

function text(value, field, max = 240) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) fail(`${field}_invalid`)
  assertPublicSafe(normalized, `${field}_private_or_secret_shape`)
  return normalized
}

function list(value, field, { min = 0, max = 40 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${field}_invalid`)
  return value.map((item) => text(item, field, 200))
}

function sameArray(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index])
}

function sourceDigestFor(receipt) {
  if (receipt?.digest) return exactDigest(receipt.digest, 'product_readiness_matrix_source_digest_invalid')
  if (receipt?.packet?.digest) return exactDigest(receipt.packet.digest, 'product_readiness_matrix_source_digest_invalid')
  if (receipt?.packet?.sourceDigest) return exactDigest(receipt.packet.sourceDigest, 'product_readiness_matrix_source_digest_invalid')
  fail('product_readiness_matrix_source_digest_missing')
}

function releaseGateFrom(handoff) {
  const githubOk = handoff.githubMainProtection?.assessment?.ok === true
  if (!githubOk) return 'github_main_protection'
  return handoff.remote?.candidateBranchState === 'exact' ? 'pull_request_creation' : 'review_branch_push'
}

function productEvidenceLevel({ releaseVerified, readinessItem }) {
  if (releaseVerified && readinessItem?.localStatus === 'release-candidate-local') return 'local_verified_release_candidate'
  return 'source_mapped_unverified'
}

function productNextAction(productId, shopPilotDay0Readiness = null) {
  if (productId === 'shop') {
    if (shopPilotDay0Readiness?.day0Readiness?.intakePacketAccepted === true
      && shopPilotDay0Readiness?.day0Readiness?.baselinePacketAccepted !== true) {
      return 'After GitHub main protection and review PR gates, capture the owner-private baseline, rehearse preview, then collect 20 consecutive accepted observed runs covering pilot days 1 through 5 before activation review.'
    }
    return 'After GitHub main protection and review PR gates, capture owner-private baseline and intake, rehearse preview, then collect 20 consecutive accepted observed runs covering pilot days 1 through 5 before activation review.'
  }
  if (productId === 'plant') {
    return 'Keep security and regression maintenance only until Shop pilot decision; then run one order-bound OEE review with operator, supervisor, source mapping, and measured correction effort.'
  }
  if (productId === 'website') {
    return 'Keep brief/export/regression maintenance only until Shop pilot decision; then run one named-business brief through accepted responsive preview before any domain or publish action.'
  }
  return 'Keep storefront exception and handoff maintenance only until Shop pilot decision; then prove cart-to-Shop exception handling before payment, delivery, refund, or stock automation.'
}

function productBlockers(productId, releaseGate, readinessItem, readiness, shopPilotDay0Readiness = null) {
  const blockers = []
  if (releaseGate === 'github_main_protection') blockers.push('github_main_protection')
  if (productId === 'shop') {
    if (shopPilotDay0Readiness?.day0Readiness?.baselinePacketAccepted !== true) blockers.push('owner_private_baseline')
    if (shopPilotDay0Readiness?.day0Readiness?.intakePacketAccepted !== true) blockers.push('owner_private_intake')
    blockers.push('real_shop_pilot_evidence')
  } else {
    blockers.push('shop_pilot_decision_not_complete')
    blockers.push(`${productId}_managed_proof_missing`)
  }
  for (const gate of readiness?.overall?.blockingGateIds || []) {
    if (!blockers.includes(gate)) blockers.push(gate)
  }
  if (readinessItem?.managedPilotStatus === 'blocked' && readinessItem?.workOrderId && !blockers.includes(readinessItem.workOrderId)) {
    blockers.push(readinessItem.workOrderId)
  }
  return blockers
}

function matrixProduct({ product, readinessItem, releaseGate, releaseVerified, readiness, shopPilotDay0Readiness }) {
  return {
    productId: text(product.productId, 'product_readiness_matrix_product_id', 40),
    name: text(product.name || product.productId, 'product_readiness_matrix_product_name', 80),
    classification: text(product.classification || 'customer-product', 'product_readiness_matrix_product_classification', 80),
    lifecycleState: text(product.lifecycleState || 'unknown', 'product_readiness_matrix_lifecycle', 80),
    localStatus: text(readinessItem?.localStatus || 'unknown', 'product_readiness_matrix_local_status', 80),
    managedPilotStatus: text(readinessItem?.managedPilotStatus || 'blocked', 'product_readiness_matrix_managed_status', 80),
    automationStatus: text(readinessItem?.automationStatus || 'owner-gated', 'product_readiness_matrix_automation_status', 80),
    appRoute: text(product.appRoute || '/', 'product_readiness_matrix_app_route', 80),
    sourcePathCount: Array.isArray(product.sourcePaths) ? product.sourcePaths.length : 0,
    workOrderId: text(readinessItem?.workOrderId || product.workOrderId || `${product.productId}-work-order`, 'product_readiness_matrix_work_order', 120),
    evidenceLevel: productEvidenceLevel({ releaseVerified, readinessItem }),
    currentBlockers: productBlockers(product.productId, releaseGate, readinessItem, readiness, shopPilotDay0Readiness),
    requiredProof: text(readinessItem?.requiredProof || product.requiredProof, 'product_readiness_matrix_required_proof', 520),
    nextAction: productNextAction(product.productId, shopPilotDay0Readiness),
    claims: {
      localCandidateVerified: releaseVerified && readinessItem?.localStatus === 'release-candidate-local',
      productionLive: false,
      commercialProofReady: false,
      managedActivationReady: false,
      erpReplacementClaimAllowed: false,
    },
  }
}

export function buildProductReadinessMatrix({
  generatedAt = new Date().toISOString(),
  releaseHandoff,
  technicalEstate,
  readiness,
  operatingActionBoard,
  shopPilotDay0Readiness = null,
  sourceDigests = {},
} = {}) {
  assertPublicSafe({ releaseHandoff, technicalEstate, readiness, operatingActionBoard, shopPilotDay0Readiness })
  if (!isRecord(releaseHandoff)) fail('product_readiness_matrix_handoff_required')
  if (!isRecord(technicalEstate)) fail('product_readiness_matrix_estate_required')
  if (!isRecord(readiness)) fail('product_readiness_matrix_readiness_required')
  if (!isRecord(operatingActionBoard)) fail('product_readiness_matrix_action_board_required')
  const products = technicalEstate.products || []
  if (!sameArray(products.map((product) => product.productId), PRODUCT_ORDER)) fail('product_readiness_matrix_product_order_invalid')
  if ((technicalEstate.sharedCapabilities || []).some((capability) => capability?.classification !== 'shared-capability-not-product')) {
    fail('product_readiness_matrix_ai_boundary_invalid')
  }
  if (!sameArray(operatingActionBoard.products || [], PRODUCT_ORDER)) fail('product_readiness_matrix_action_board_products_invalid')
  if (readiness.contract !== 'supermega.managed-pilot-readiness.v5' || readiness.pilotMode !== 'owner_named') fail('product_readiness_matrix_readiness_contract_invalid')
  const releaseCommit = exactSha(releaseHandoff.candidate?.commit, 'product_readiness_matrix_release_commit_invalid')
  const releaseVerified = releaseHandoff.candidate?.clean === true
    && releaseHandoff.verification?.passed === true
    && releaseHandoff.verification?.verifiedCommit === releaseCommit
  const releaseGate = releaseGateFrom(releaseHandoff)
  const readinessByProduct = new Map((readiness.products || []).map((item) => [item.productId, item]))
  const shopPilotDay0Packet = shopPilotDay0Readiness
    ? validateShopPilotDay0ReadinessPacket(shopPilotDay0Readiness)
    : null
  const matrix = {
    contract: PRODUCT_READINESS_MATRIX_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: exactTimestamp(generatedAt, 'product_readiness_matrix_generated_at_invalid'),
    mode: 'local_no_external_effects',
    productOrder: [...PRODUCT_ORDER],
    aiBoundary: {
      customerProductsOnly: true,
      aiIsSharedCapabilityOnly: true,
      customerProductCount: PRODUCT_ORDER.length,
    },
    release: {
      candidateBranch: text(releaseHandoff.candidate?.branch, 'product_readiness_matrix_release_branch', 140),
      candidateCommit: releaseCommit,
      candidateClean: releaseHandoff.candidate?.clean === true,
      localVerificationPassed: releaseVerified,
      liveCommit: exactSha(releaseHandoff.live?.identity?.commit, 'product_readiness_matrix_live_commit_invalid'),
      remoteMainCommit: exactSha(releaseHandoff.remote?.mainCommit, 'product_readiness_matrix_remote_main_invalid'),
      candidateAheadOfMain: Number(releaseHandoff.relations?.candidateAheadOfMain),
      candidateAheadOfLive: Number(releaseHandoff.relations?.candidateAheadOfLive),
      currentGateId: releaseGate,
      githubMainProtectionOk: releaseHandoff.githubMainProtection?.assessment?.ok === true,
      releaseOrDeploymentAllowed: false,
    },
    products: products.map((product) => matrixProduct({
      product,
      readinessItem: readinessByProduct.get(product.productId),
      releaseGate,
      releaseVerified,
      readiness,
      shopPilotDay0Readiness: shopPilotDay0Packet,
    })),
    operatingLoop: {
      actionBoardContract: text(operatingActionBoard.contract, 'product_readiness_matrix_action_contract', 100),
      totalActions: Number(operatingActionBoard.weeklyReport?.totalActions),
      openActionCount: Number(operatingActionBoard.weeklyReport?.openActionCount),
      ownerGatedCount: Number(operatingActionBoard.weeklyReport?.ownerGatedCount),
      criticalOpenCount: Number(operatingActionBoard.weeklyReport?.criticalOpenCount),
      currentOpenActionId: operatingActionBoard.actions?.find((action) => ['owner-gated', 'blocked', 'open', 'proposed'].includes(action.status))?.id || null,
    },
    forbiddenClaims: [
      'production_release_ready',
      'managed_activation_ready',
      'commercial_pilot_proven',
      'revenue_proven',
      'erp_replacement_claim',
      'autonomous_payment_or_stock_actions',
      'customer_message_automation',
      'hosted_write_readiness',
    ],
    sourceDigests: {
      releaseHandoffDigest: sourceDigestFor(sourceDigests.releaseHandoff || { packet: releaseHandoff }),
      technicalEstateDigest: sourceDigestFor(sourceDigests.technicalEstate || { packet: technicalEstate }),
      managedReadinessDigest: sourceDigestFor(sourceDigests.readiness || { packet: readiness }),
      operatingActionBoardDigest: sourceDigestFor(sourceDigests.operatingActionBoard || { packet: operatingActionBoard }),
      ...(shopPilotDay0Packet
        ? { shopPilotDay0ReadinessDigest: sourceDigestFor(sourceDigests.shopPilotDay0Readiness || { packet: shopPilotDay0Packet }) }
        : {}),
    },
    controls: Object.fromEntries(FALSE_CONTROL_FIELDS.map((field) => [field, false])),
  }
  if (!Number.isSafeInteger(matrix.release.candidateAheadOfMain) || matrix.release.candidateAheadOfMain < 0) fail('product_readiness_matrix_ahead_main_invalid')
  if (!Number.isSafeInteger(matrix.release.candidateAheadOfLive) || matrix.release.candidateAheadOfLive < 0) fail('product_readiness_matrix_ahead_live_invalid')
  assertPublicSafe(matrix)
  return { ...matrix, digest: packetDigest(matrix) }
}

function validateProductEntry(product) {
  if (!isRecord(product)) fail('product_readiness_matrix_product_invalid')
  const productId = text(product.productId, 'product_readiness_matrix_product_id', 40)
  if (!PRODUCT_ORDER.includes(productId)) fail('product_readiness_matrix_product_id_invalid')
  if (product.classification !== 'customer-product') fail('product_readiness_matrix_product_classification_invalid')
  if (!Number.isSafeInteger(product.sourcePathCount) || product.sourcePathCount < 3) fail('product_readiness_matrix_source_path_count_invalid')
  if (!['local_verified_release_candidate', 'source_mapped_unverified'].includes(product.evidenceLevel)) fail('product_readiness_matrix_evidence_level_invalid')
  if (!Array.isArray(product.currentBlockers) || product.currentBlockers.length < 1) fail('product_readiness_matrix_product_blockers_invalid')
  if (!isRecord(product.claims)
    || product.claims.productionLive !== false
    || product.claims.commercialProofReady !== false
    || product.claims.managedActivationReady !== false
    || product.claims.erpReplacementClaimAllowed !== false) fail('product_readiness_matrix_product_claims_invalid')
  return product
}

export function validateProductReadinessMatrix(matrix) {
  assertPublicSafe(matrix)
  if (!isRecord(matrix) || matrix.contract !== PRODUCT_READINESS_MATRIX_CONTRACT) fail('product_readiness_matrix_contract_invalid')
  if (matrix.digestScope !== 'utf8_compact_json_without_digest') fail('product_readiness_matrix_digest_scope_invalid')
  exactTimestamp(matrix.generatedAt, 'product_readiness_matrix_generated_at_invalid')
  if (matrix.mode !== 'local_no_external_effects') fail('product_readiness_matrix_mode_invalid')
  if (!sameArray(matrix.productOrder, PRODUCT_ORDER)) fail('product_readiness_matrix_product_order_invalid')
  if (!isRecord(matrix.aiBoundary)
    || matrix.aiBoundary.customerProductsOnly !== true
    || matrix.aiBoundary.aiIsSharedCapabilityOnly !== true
    || matrix.aiBoundary.customerProductCount !== PRODUCT_ORDER.length) fail('product_readiness_matrix_ai_boundary_invalid')
  const release = matrix.release
  if (!isRecord(release)
    || !SHA_PATTERN.test(release.candidateCommit || '')
    || !SHA_PATTERN.test(release.liveCommit || '')
    || !SHA_PATTERN.test(release.remoteMainCommit || '')
    || release.candidateClean !== true
    || release.localVerificationPassed !== true
    || !['github_main_protection', 'review_branch_push', 'pull_request_creation'].includes(release.currentGateId)
    || release.releaseOrDeploymentAllowed !== false) fail('product_readiness_matrix_release_invalid')
  if (!Array.isArray(matrix.products)
    || !sameArray(matrix.products.map((product) => product.productId), PRODUCT_ORDER)) fail('product_readiness_matrix_products_invalid')
  matrix.products.forEach(validateProductEntry)
  if (!isRecord(matrix.operatingLoop)
    || matrix.operatingLoop.actionBoardContract !== 'supermega.operating-action-board.v1'
    || !Number.isSafeInteger(matrix.operatingLoop.totalActions)
    || !Number.isSafeInteger(matrix.operatingLoop.openActionCount)
    || !Number.isSafeInteger(matrix.operatingLoop.ownerGatedCount)
    || !Number.isSafeInteger(matrix.operatingLoop.criticalOpenCount)) fail('product_readiness_matrix_operating_loop_invalid')
  if (!Array.isArray(matrix.forbiddenClaims)
    || !matrix.forbiddenClaims.includes('managed_activation_ready')
    || !matrix.forbiddenClaims.includes('erp_replacement_claim')) fail('product_readiness_matrix_forbidden_claims_invalid')
  if (!isRecord(matrix.sourceDigests)
    || !DIGEST_PATTERN.test(matrix.sourceDigests.releaseHandoffDigest || '')
    || !DIGEST_PATTERN.test(matrix.sourceDigests.technicalEstateDigest || '')
    || !DIGEST_PATTERN.test(matrix.sourceDigests.managedReadinessDigest || '')
    || !DIGEST_PATTERN.test(matrix.sourceDigests.operatingActionBoardDigest || '')) fail('product_readiness_matrix_source_digests_invalid')
  if (matrix.sourceDigests.shopPilotDay0ReadinessDigest !== undefined
    && !DIGEST_PATTERN.test(matrix.sourceDigests.shopPilotDay0ReadinessDigest || '')) fail('product_readiness_matrix_source_digests_invalid')
  if (!isRecord(matrix.controls) || FALSE_CONTROL_FIELDS.some((field) => matrix.controls[field] !== false)) fail('product_readiness_matrix_controls_invalid')
  exactDigest(matrix.digest, 'product_readiness_matrix_digest_invalid')
  if (matrix.digest !== packetDigest(cloneWithoutDigest(matrix))) fail('product_readiness_matrix_digest_mismatch')
  return matrix
}

export function renderProductReadinessMatrixMarkdown(matrix) {
  const packet = validateProductReadinessMatrix(matrix)
  const productRows = packet.products.map((product) => (
    `| ${product.name} | ${product.evidenceLevel} | ${product.managedPilotStatus} | ${product.currentBlockers.slice(0, 3).join(', ')} | ${product.nextAction} |`
  )).join('\n')
  return `# SuperMega product readiness matrix

Contract: \`${packet.contract}\`
Current gate: \`${packet.release.currentGateId}\`
Candidate: \`${packet.release.candidateCommit}\`
Mode: \`${packet.mode}\`

| Product | Evidence level | Managed status | First blockers | Next action |
| --- | --- | --- | --- | --- |
${productRows}

## Claims not allowed yet

${packet.forbiddenClaims.map((claim) => `- \`${claim}\``).join('\n')}

No GitHub write, git remote write, Vercel deployment, Supabase mutation, credential action, customer contact, automatic message, payment, stock movement, hosted write, local subagent start, or managed activation was performed.
`
}

async function readJsonReceipt(path, validator, code) {
  const absolute = resolve(path)
  const text = await readFile(absolute, 'utf8')
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes < 1 || bytes > MAX_FILE_BYTES) fail(`${code}_file_invalid`)
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    fail(`${code}_json_invalid`)
  }
  return {
    path: absolute,
    bytes,
    digest: digest(text),
    packet: validator(parsed),
  }
}

async function writeExclusive(path, content) {
  const absolute = resolve(path)
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' })
  return absolute
}

function fixture() {
  const releaseHandoff = {
    generatedAt: '2026-08-25T00:00:00.000Z',
    repository: 'swanhtet01/swanhtet01.github.io',
    candidate: { branch: 'codex/release-stack-integration-rehearsal-20260825', commit: 'a'.repeat(40), clean: true },
    remote: { mainCommit: 'b'.repeat(40) },
    live: { identity: { commit: 'c'.repeat(40) } },
    relations: { candidateAheadOfMain: 100, candidateAheadOfLive: 102 },
    verification: { passed: true, verifiedCommit: 'a'.repeat(40) },
    githubMainProtection: { assessment: { ok: false, failures: ['main_unprotected'] } },
    digest: `sha256:${'1'.repeat(64)}`,
  }
  const products = PRODUCT_ORDER.map((productId) => ({
    productId,
    name: productId[0].toUpperCase() + productId.slice(1),
    classification: 'customer-product',
    lifecycleState: 'release-candidate-local',
    appRoute: `/${productId}/`,
    sourcePaths: ['showroom/src/App.tsx', `showroom/src/products/${productId}`, 'showroom/src/core/CoreApp.tsx'],
    workOrderId: `${productId}-work-order`,
    requiredProof: `${productId} owner-reviewed managed proof remains required before activation.`,
  }))
  const technicalEstate = {
    products,
    sharedCapabilities: [{ id: 'ai-assistance', classification: 'shared-capability-not-product' }],
    sourceDigest: `sha256:${'2'.repeat(64)}`,
  }
  const readiness = {
    contract: 'supermega.managed-pilot-readiness.v5',
    pilotMode: 'owner_named',
    overall: { blockingGateIds: ['preview_rehearsal', 'pilot_evidence', 'production_activation'] },
    products: PRODUCT_ORDER.map((productId) => ({
      productId,
      localStatus: 'release-candidate-local',
      managedPilotStatus: 'blocked',
      automationStatus: 'owner-gated',
      workOrderId: productId === 'shop' ? 'shop-spa-owner-pilot' : `${productId}-managed-proof`,
      requiredProof: `${productId} proof must be collected from owner-reviewed private evidence.`,
    })),
    sourceDigest: `sha256:${'3'.repeat(64)}`,
  }
  const operatingActionBoard = {
    contract: 'supermega.operating-action-board.v1',
    products: [...PRODUCT_ORDER],
    weeklyReport: { totalActions: 4, openActionCount: 2, ownerGatedCount: 2, criticalOpenCount: 1 },
    actions: [{ id: 'release-main-protection', status: 'owner-gated' }],
    digest: `sha256:${'4'.repeat(64)}`,
  }
  return { releaseHandoff, technicalEstate, readiness, operatingActionBoard }
}

function runSelfTest() {
  const ready = buildProductReadinessMatrix({
    ...fixture(),
    generatedAt: '2026-08-25T00:00:00.000Z',
  })
  validateProductReadinessMatrix(ready)
  const markdown = renderProductReadinessMatrixMarkdown(ready)
  assertPublicSafe(markdown)
  const checks = {
    product_order_preserved: sameArray(ready.productOrder, PRODUCT_ORDER),
    shop_first_money_path_visible: ready.products[0].productId === 'shop' && ready.products[0].currentBlockers.includes('owner_private_baseline'),
    plant_waits_for_shop_decision: ready.products.find((product) => product.productId === 'plant').currentBlockers.includes('shop_pilot_decision_not_complete'),
    github_gate_first: ready.release.currentGateId === 'github_main_protection',
    forbidden_claims_preserved: ready.forbiddenClaims.includes('managed_activation_ready') && ready.forbiddenClaims.includes('erp_replacement_claim'),
    no_external_effects: Object.values(ready.controls).every((value) => value === false),
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key)
  return {
    ok: failedChecks.length === 0,
    contract: `${PRODUCT_READINESS_MATRIX_CONTRACT}.self-test`,
    checks,
    failedChecks,
    externalWritesPerformed: false,
  }
}

function parseArgs(argv) {
  const options = {
    selfTest: false,
    verify: null,
    handoff: null,
    technicalEstate: DEFAULT_TECHNICAL_ESTATE,
    readiness: DEFAULT_READINESS,
    operatingActionBoard: DEFAULT_OPERATING_ACTION_BOARD,
    shopPilotDay0Readiness: null,
    output: null,
    markdownOutput: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--self-test') options.selfTest = true
    else if (arg === '--verify') options.verify = argv[++index] || null
    else if (arg === '--handoff') options.handoff = argv[++index] || null
    else if (arg === '--technical-estate') options.technicalEstate = argv[++index] || null
    else if (arg === '--readiness') options.readiness = argv[++index] || null
    else if (arg === '--operating-action-board') options.operatingActionBoard = argv[++index] || null
    else if (arg === '--shop-day0-readiness') options.shopPilotDay0Readiness = argv[++index] || null
    else if (arg === '--output') options.output = argv[++index] || null
    else if (arg === '--markdown-output') options.markdownOutput = argv[++index] || null
    else fail(`product_readiness_matrix_usage_invalid:${arg}`)
  }
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.selfTest) {
    const result = runSelfTest()
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return
  }
  if (options.verify) {
    const packet = validateProductReadinessMatrix(JSON.parse(await readFile(resolve(options.verify), 'utf8')))
    console.log(JSON.stringify({
      ok: true,
      contract: packet.contract,
      status: packet.release.currentGateId,
      products: packet.products.length,
      digest: packet.digest,
      externalWritesPerformed: false,
    }, null, 2))
    return
  }
  if (!options.handoff || !options.output) fail('product_readiness_matrix_handoff_and_output_required')
  const handoffReceipt = await readJsonReceipt(options.handoff, validateReleaseHandoffPacket, 'product_readiness_matrix_handoff')
  const estateReceipt = await readJsonReceipt(options.technicalEstate, validateTechnicalEstate, 'product_readiness_matrix_estate')
  const readinessReceipt = await readJsonReceipt(options.readiness, validateManagedPilotReadiness, 'product_readiness_matrix_readiness')
  const actionBoardReceipt = await readJsonReceipt(options.operatingActionBoard, validateOperatingActionBoard, 'product_readiness_matrix_action_board')
  const shopPilotDay0Receipt = options.shopPilotDay0Readiness
    ? await readJsonReceipt(options.shopPilotDay0Readiness, validateShopPilotDay0ReadinessPacket, 'product_readiness_matrix_shop_day0')
    : null
  const packet = buildProductReadinessMatrix({
    generatedAt: new Date().toISOString(),
    releaseHandoff: handoffReceipt.packet,
    technicalEstate: estateReceipt.packet,
    readiness: readinessReceipt.packet,
    operatingActionBoard: actionBoardReceipt.packet,
    shopPilotDay0Readiness: shopPilotDay0Receipt?.packet || null,
    sourceDigests: {
      releaseHandoff: handoffReceipt,
      technicalEstate: estateReceipt,
      readiness: readinessReceipt,
      operatingActionBoard: actionBoardReceipt,
      ...(shopPilotDay0Receipt ? { shopPilotDay0Readiness: shopPilotDay0Receipt } : {}),
    },
  })
  await writeExclusive(options.output, `${JSON.stringify(packet, null, 2)}\n`)
  if (options.markdownOutput) await writeExclusive(options.markdownOutput, `${renderProductReadinessMatrixMarkdown(packet)}\n`)
  console.log(JSON.stringify({
    ok: true,
    contract: packet.contract,
    output: resolve(options.output),
    markdownOutput: options.markdownOutput ? resolve(options.markdownOutput) : null,
    digest: packet.digest,
    products: packet.products.length,
    currentGateId: packet.release.currentGateId,
    externalWritesPerformed: false,
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: PRODUCT_READINESS_MATRIX_CONTRACT,
      error: String(error?.message || 'product_readiness_matrix_failed').slice(0, 240),
      externalWritesPerformed: false,
    }, null, 2))
    process.exitCode = 1
  })
}

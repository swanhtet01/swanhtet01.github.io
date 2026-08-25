#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateManagedPilotReadiness } from '../kernel/managed-pilot-readiness.mjs'
import { validateTechnicalEstate } from './manage_technical_estate.mjs'
import { verifyShopPilotPublicBoundary, verifyShopPilotPublicBoundaryFiles } from './verify_shop_pilot_public_boundary.mjs'

export const SHOP_PILOT_LAUNCH_GATE_CONTRACT = 'supermega.shop-pilot-launch-gate.v1'

const root = resolve(import.meta.dirname, '..')
const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const REQUIRED_PRODUCTS = ['shop', 'plant', 'website', 'ecommerce']
const REQUIRED_BLOCKING_GATES = ['preview_rehearsal', 'pilot_evidence', 'production_activation']
const REQUIRED_FORBIDDEN_ACTIONS = [
  'deploy',
  'publish',
  'production_write',
  'customer_message',
  'payment',
  'hosted_scheduler_activation',
]
export const SHOP_PILOT_LAUNCH_HQ_CHAIN = 'node tools/record_postgres17_rehearsal.mjs --verify && node tools/verify_supabase_security_advisor_audit.mjs && node tools/manage_technical_estate.mjs --verify && node tools/manage_managed_pilot_readiness.mjs --verify && node tools/prepare_supabase_preview_rehearsal_proposal.mjs --verify && node tools/prepare_github_main_protection_packet.mjs --verify && node tools/verify_release_stack_owner_gates.mjs --verify && npm run release:owner-approval:packet:self-test && npm run shop:pilot:intake-packet:self-test && node tools/verify_shop_pilot_launch_gate.mjs --verify && node tools/verify_hq_contract.mjs'
const REQUIRED_SCRIPTS = {
  'client:pilot:workspace': 'node tools/manage_shop_pilot_workspace.mjs',
  'client:pilot:handoff': 'node tools/create_shop_pilot_handoff.mjs',
  'client:pilot:observed-evidence': 'node tools/record_shop_pilot_observed_run.mjs',
  'client:pilot:public-boundary:verify': 'node tools/verify_shop_pilot_public_boundary.mjs --file hq/readiness/shop-pilot-public-boundary.json',
  'shop:run001:claims:verify': 'node tools/verify_shop_run001_claims_guard.mjs',
  'shop:pilot:intake-packet': 'node tools/prepare_shop_pilot_private_intake_packet.mjs',
  'shop:pilot:intake-packet:self-test': 'node --test tools/prepare_shop_pilot_private_intake_packet.test.mjs && node tools/prepare_shop_pilot_private_intake_packet.mjs --self-test',
  'shop:pilot:launch-gate:verify': 'node tools/verify_shop_pilot_launch_gate.mjs --verify',
  'shop:pilot:launch-gate:self-test': 'node --test tools/verify_shop_pilot_launch_gate.test.mjs && node tools/verify_shop_pilot_launch_gate.mjs --self-test',
}
const PUBLIC_BOUNDARY_FALSE_CONTROLS = [
  'automaticSendAllowed',
  'paymentAllowed',
  'deploymentAllowed',
  'productionActivationAllowed',
  'hostedWritesAllowed',
  'externalWritesPerformed',
  'customerContactPerformed',
  'managedActivation',
  'managedActivationReady',
  'managedPersistenceReady',
  'shopPilotProof',
  'pilotProof',
  'promotionEvidence',
  'readyToRecord',
  'paymentAccepted',
  'stockMovementPerformed',
  'serverWritePerformed',
  'hostedWritePerformed',
  'credentialChangePerformed',
  'providerMutationPerformed',
]
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^"\s]+/i,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
]

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}`
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index])
}

function includesAll(actual, expected) {
  return Array.isArray(actual) && expected.every((value) => actual.includes(value))
}

function falseOnly(record, keys) {
  return isRecord(record) && keys.every((key) => record[key] === false)
}

function addFailure(failures, code) {
  if (!failures.includes(code)) failures.push(code)
}

function hasSecretShape(value) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(JSON.stringify(value || {})))
}

function gate(id, label, status, blocks, evidence) {
  return { id, label, status, blocks, evidence }
}

export function assessShopPilotLaunchGate(input = {}) {
  const failures = []
  const packageManifest = input.packageManifest || {}
  const scripts = packageManifest.scripts || {}
  const technicalEstate = input.technicalEstate || {}
  const readiness = input.readiness || {}
  const publicBoundary = input.publicBoundary || {}
  const publicBoundaryVerification = input.publicBoundaryVerification || {}
  const gitState = input.gitState || {}

  if (input.repository !== REPOSITORY) addFailure(failures, 'shop_pilot_launch_gate_repository_invalid')
  if (packageManifest.supermega?.productionSupabaseTargetStatus !== 'protected-unapproved') {
    addFailure(failures, 'shop_pilot_launch_gate_supabase_target_status_invalid')
  }
  for (const [name, command] of Object.entries(REQUIRED_SCRIPTS)) {
    if (scripts[name] !== command) addFailure(failures, `shop_pilot_launch_gate_script_missing:${name}`)
  }
  if (scripts['hq:verify'] !== SHOP_PILOT_LAUNCH_HQ_CHAIN) addFailure(failures, 'shop_pilot_launch_gate_hq_chain_missing')

  if (technicalEstate.schemaVersion !== 'supermega.technical-estate.v1') addFailure(failures, 'shop_pilot_launch_gate_estate_contract_invalid')
  if (technicalEstate.canonicalSource?.repository !== REPOSITORY) addFailure(failures, 'shop_pilot_launch_gate_estate_repository_invalid')
  if (!sameArray((technicalEstate.products || []).map((product) => product.productId), REQUIRED_PRODUCTS)) {
    addFailure(failures, 'shop_pilot_launch_gate_product_set_invalid')
  }
  if (technicalEstate.lifecycle?.currentPriority !== 'shop-first-managed-pilot-readiness'
    || !sameArray(technicalEstate.lifecycle?.nextProductSequence, REQUIRED_PRODUCTS)) {
    addFailure(failures, 'shop_pilot_launch_gate_lifecycle_order_invalid')
  }
  if (technicalEstate.ownerGates?.externalEffectsAllowed !== false
    || technicalEstate.ownerGates?.productionWritesAllowed !== false
    || technicalEstate.ownerGates?.localSubagentsAllowedByDefault !== false) {
    addFailure(failures, 'shop_pilot_launch_gate_estate_owner_gates_invalid')
  }

  if (readiness.contract !== 'supermega.managed-pilot-readiness.v5') addFailure(failures, 'shop_pilot_launch_gate_readiness_contract_invalid')
  if (readiness.pilotMode !== 'owner_named') addFailure(failures, 'shop_pilot_launch_gate_pilot_mode_invalid')
  if (readiness.overall?.status !== 'blocked'
    || readiness.overall?.hostedActivationReady !== false
    || readiness.overall?.blockingGateCount !== REQUIRED_BLOCKING_GATES.length
    || !sameArray(readiness.overall?.blockingGateIds, REQUIRED_BLOCKING_GATES)) {
    addFailure(failures, 'shop_pilot_launch_gate_overall_state_invalid')
  }
  if (readiness.liveProduction?.operatingMode !== 'isolated_demo'
    || readiness.liveProduction?.managedWritesEnabled !== false
    || readiness.liveProduction?.productionMutationAuthorized !== false) {
    addFailure(failures, 'shop_pilot_launch_gate_live_production_state_invalid')
  }
  if (readiness.previewRehearsal?.proofComplete !== false
    || readiness.previewRehearsal?.productionRefsRejected !== true
    || readiness.previewRehearsal?.productionDataRejected !== true
    || readiness.previewRehearsal?.privilegedRuntimeCredentialsRejected !== true) {
    addFailure(failures, 'shop_pilot_launch_gate_preview_rehearsal_state_invalid')
  }
  if (readiness.pilotEvidence?.pilotMode !== 'owner_named'
    || readiness.pilotEvidence?.productId !== 'shop'
    || readiness.pilotEvidence?.proofComplete !== false
    || readiness.pilotEvidence?.requiredAcceptedConsecutiveRuns !== 20
    || readiness.pilotEvidence?.acceptedConsecutiveRuns !== 0
    || readiness.pilotEvidence?.syntheticEvidenceAccepted !== false
    || readiness.pilotEvidence?.publicIdentityAllowed !== false
    || readiness.pilotEvidence?.privateWorkspaceRequired !== true) {
    addFailure(failures, 'shop_pilot_launch_gate_pilot_evidence_state_invalid')
  }
  if (readiness.controls?.externalWritesPerformed !== false
    || readiness.controls?.productionWritesEnabled !== false
    || readiness.controls?.ownerApprovalRequired !== true
    || !includesAll(readiness.controls?.forbiddenUntilReady, REQUIRED_FORBIDDEN_ACTIONS)) {
    addFailure(failures, 'shop_pilot_launch_gate_readiness_controls_invalid')
  }

  try {
    verifyShopPilotPublicBoundary(publicBoundary)
  } catch (error) {
    addFailure(failures, `shop_pilot_launch_gate_public_boundary_invalid:${String(error?.message || 'failed').slice(0, 120)}`)
  }
  if (publicBoundary.contract !== 'supermega.shop.pilot_public_boundary.v1'
    || publicBoundary.product !== 'shop'
    || publicBoundary.pilotMode !== 'owner_named'
    || publicBoundary.stage !== 'owner-decision-required'
    || !['revise', 'decline'].includes(publicBoundary.decision)
    || publicBoundary.acceptedRuns !== 0
    || publicBoundary.consecutiveAcceptedRuns !== 0
    || publicBoundary.participantIdentityPresent !== false
    || publicBoundary.secretValuesExposed !== false
    || !falseOnly(publicBoundary.controls, PUBLIC_BOUNDARY_FALSE_CONTROLS)) {
    addFailure(failures, 'shop_pilot_launch_gate_public_boundary_state_invalid')
  }
  if (publicBoundaryVerification.ok !== true
    || publicBoundaryVerification.externalWritesPerformed !== false
    || publicBoundaryVerification.customerContactPerformed !== false
    || !Array.isArray(publicBoundaryVerification.fileDigests)
    || publicBoundaryVerification.fileDigests.length !== 1) {
    addFailure(failures, 'shop_pilot_launch_gate_public_boundary_file_invalid')
  }

  if (gitState.clean !== true) addFailure(failures, 'shop_pilot_launch_gate_worktree_dirty')
  if (!/^[0-9a-f]{40}$/.test(String(gitState.head || ''))) addFailure(failures, 'shop_pilot_launch_gate_head_invalid')
  if (!gitState.branch || typeof gitState.branch !== 'string') addFailure(failures, 'shop_pilot_launch_gate_branch_invalid')
  if (Number.isInteger(gitState.aheadOfOriginMain) && gitState.aheadOfOriginMain < 1) addFailure(failures, 'shop_pilot_launch_gate_no_review_delta')

  if (hasSecretShape({ readiness, publicBoundary })) addFailure(failures, 'shop_pilot_launch_gate_secret_shape_detected')

  const body = {
    contract: SHOP_PILOT_LAUNCH_GATE_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: input.generatedAt || new Date().toISOString(),
    repository: REPOSITORY,
    status: failures.length ? 'failed' : 'owner_private_intake_required',
    ok: failures.length === 0,
    candidate: {
      branch: gitState.branch || null,
      head: gitState.head || null,
      clean: gitState.clean === true,
      originMain: gitState.originMain || null,
      aheadOfOriginMain: Number.isInteger(gitState.aheadOfOriginMain) ? gitState.aheadOfOriginMain : null,
      diffShortstat: gitState.diffShortstat || null,
    },
    products: {
      customerProducts: REQUIRED_PRODUCTS,
      firstPilotProduct: 'shop',
      aiIsSharedCapability: true,
    },
    readiness: {
      contract: readiness.contract || null,
      pilotMode: readiness.pilotMode || null,
      overallStatus: readiness.overall?.status || null,
      hostedActivationReady: readiness.overall?.hostedActivationReady === true,
      blockingGateIds: Array.isArray(readiness.overall?.blockingGateIds) ? [...readiness.overall.blockingGateIds] : [],
      liveOperatingMode: readiness.liveProduction?.operatingMode || null,
      managedWritesEnabled: readiness.liveProduction?.managedWritesEnabled === true,
      previewRehearsalProofComplete: readiness.previewRehearsal?.proofComplete === true,
      pilotProofComplete: readiness.pilotEvidence?.proofComplete === true,
      requiredAcceptedConsecutiveRuns: readiness.pilotEvidence?.requiredAcceptedConsecutiveRuns ?? null,
      acceptedConsecutiveRuns: readiness.pilotEvidence?.acceptedConsecutiveRuns ?? null,
      syntheticEvidenceAccepted: readiness.pilotEvidence?.syntheticEvidenceAccepted === true,
      publicIdentityAllowed: readiness.pilotEvidence?.publicIdentityAllowed === true,
      privateWorkspaceRequired: readiness.pilotEvidence?.privateWorkspaceRequired === true,
    },
    publicBoundary: {
      contract: publicBoundary.contract || null,
      stage: publicBoundary.stage || null,
      decision: publicBoundary.decision || null,
      acceptedRuns: publicBoundary.acceptedRuns ?? null,
      consecutiveAcceptedRuns: publicBoundary.consecutiveAcceptedRuns ?? null,
      participantIdentityPresent: publicBoundary.participantIdentityPresent === true,
      secretValuesExposed: publicBoundary.secretValuesExposed === true,
      fileDigest: publicBoundaryVerification.fileDigests?.[0] || null,
      externalWritesPerformed: publicBoundaryVerification.externalWritesPerformed === true,
      customerContactPerformed: publicBoundaryVerification.customerContactPerformed === true,
    },
    launchReadiness: {
      authority: 'owner_private_intake_only',
      privateWorkspaceMayBePreparedAfterOwnerInput: failures.length === 0,
      readyForCustomerContact: false,
      readyForPayment: false,
      readyForDeployment: false,
      readyForManagedActivation: false,
      readyForPromotionEvidence: false,
      promotionEvidenceRequiredAcceptedRuns: 20,
      promotionEvidenceAcceptedRuns: readiness.pilotEvidence?.acceptedConsecutiveRuns ?? 0,
    },
    requiredNextGates: [
      gate('owner_private_intake', 'Owner selects and reviews the private Shop pilot workspace input', failures.length ? 'blocked' : 'owner_action_required', true, 'Only private intake preparation can proceed; participant identity remains outside Git, CI, HQ records, and reports.'),
      gate('exact_preview_rehearsal', 'Exact-candidate protected preview rehearsal', 'owner_approval_required', true, 'The preview rehearsal must be bound to the reviewed SHA and migration digests before release.'),
      gate('real_shop_pilot_evidence', 'Real owner-reviewed Shop pilot evidence', 'blocked', true, '20 consecutive accepted receipt-and-anchor-bound runs are required; synthetic runs remain excluded.'),
      gate('managed_activation', 'Managed production activation', 'owner_approval_required', true, 'Production remains isolated-demo until every hosted proof passes and the owner approves exact activation.'),
    ],
    controls: {
      noWriteVerification: true,
      createPrivateWorkspaceAllowedByThisVerifier: false,
      customerContactAllowed: false,
      automaticSendAllowed: false,
      paymentAllowed: false,
      stockMovementAllowed: false,
      hostedWritesAllowed: false,
      vercelDeployAllowed: false,
      githubWritesAllowed: false,
      supabaseWritesAllowed: false,
      productionReleaseAllowed: false,
      managedActivationAllowed: false,
      externalEffectsAllowed: false,
      localSubagentsAllowedByDefault: false,
    },
    failures,
  }
  return { ...body, digest: digest(JSON.stringify(body)) }
}

export function validateShopPilotLaunchGate(report) {
  if (!isRecord(report) || report.contract !== SHOP_PILOT_LAUNCH_GATE_CONTRACT) {
    throw new Error('shop_pilot_launch_gate_contract_invalid')
  }
  const { digest: actualDigest, ...body } = report
  if (actualDigest !== digest(JSON.stringify(body))) throw new Error('shop_pilot_launch_gate_digest_invalid')
  if (report.ok !== true || report.status !== 'owner_private_intake_required' || report.failures?.length !== 0) {
    throw new Error('shop_pilot_launch_gate_not_passing')
  }
  if (report.launchReadiness?.authority !== 'owner_private_intake_only'
    || report.launchReadiness?.readyForCustomerContact !== false
    || report.launchReadiness?.readyForPayment !== false
    || report.launchReadiness?.readyForDeployment !== false
    || report.launchReadiness?.readyForManagedActivation !== false
    || report.launchReadiness?.readyForPromotionEvidence !== false
    || report.launchReadiness?.promotionEvidenceRequiredAcceptedRuns !== 20
    || report.launchReadiness?.promotionEvidenceAcceptedRuns !== 0) {
    throw new Error('shop_pilot_launch_gate_launch_readiness_invalid')
  }
  if (report.controls?.noWriteVerification !== true
    || report.controls?.customerContactAllowed !== false
    || report.controls?.paymentAllowed !== false
    || report.controls?.hostedWritesAllowed !== false
    || report.controls?.managedActivationAllowed !== false
    || report.controls?.externalEffectsAllowed !== false) {
    throw new Error('shop_pilot_launch_gate_controls_invalid')
  }
  return report
}

function git(args, { optional = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1_000_000,
    windowsHide: true,
  })
  const output = String(result.stdout || '').trim()
  if (!optional && result.status !== 0) throw new Error(`shop_pilot_launch_gate_git_failed:${args.join(' ')}`)
  return result.status === 0 ? output : null
}

function currentGitState() {
  const statusText = git(['status', '--porcelain'])
  const originMain = git(['rev-parse', '--verify', 'origin/main'], { optional: true })
  const aheadText = originMain ? git(['rev-list', '--count', 'origin/main..HEAD'], { optional: true }) : null
  const aheadOfOriginMain = aheadText == null || aheadText === '' ? null : Number.parseInt(aheadText, 10)
  return {
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    head: git(['rev-parse', 'HEAD']),
    clean: statusText.length === 0,
    originMain,
    aheadOfOriginMain: Number.isSafeInteger(aheadOfOriginMain) ? aheadOfOriginMain : null,
    diffShortstat: originMain ? git(['diff', '--shortstat', 'origin/main..HEAD'], { optional: true }) : null,
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'))
}

function runNoWriteVerifier(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 2_000_000,
    windowsHide: true,
  })
  if (result.status !== 0) {
    const error = String(result.stderr || result.stdout || 'failed').replace(/\s+/g, ' ').slice(0, 220)
    throw new Error(`shop_pilot_launch_gate_dependency_failed:${args.join(' ')}:${error}`)
  }
}

async function currentReport() {
  runNoWriteVerifier(['tools/manage_technical_estate.mjs', '--verify'])
  runNoWriteVerifier(['tools/manage_managed_pilot_readiness.mjs', '--verify'])
  runNoWriteVerifier(['tools/verify_shop_pilot_public_boundary.mjs', '--file', 'hq/readiness/shop-pilot-public-boundary.json'])
  runNoWriteVerifier(['tools/verify_shop_run001_claims_guard.mjs'])

  const packageManifest = await readJson('package.json')
  const technicalEstate = validateTechnicalEstate(await readJson('hq/technical-estate.json'))
  const readiness = validateManagedPilotReadiness(await readJson('hq/readiness/managed-pilot-readiness.json'))
  const publicBoundary = await readJson('hq/readiness/shop-pilot-public-boundary.json')
  const publicBoundaryVerification = verifyShopPilotPublicBoundaryFiles(['hq/readiness/shop-pilot-public-boundary.json'])

  return assessShopPilotLaunchGate({
    generatedAt: new Date().toISOString(),
    repository: REPOSITORY,
    packageManifest,
    technicalEstate,
    readiness,
    publicBoundary,
    publicBoundaryVerification,
    gitState: currentGitState(),
  })
}

export function sampleShopPilotLaunchGateInput(overrides = {}) {
  const packageManifest = {
    supermega: { productionSupabaseTargetStatus: 'protected-unapproved' },
    scripts: {
      ...REQUIRED_SCRIPTS,
      'hq:verify': SHOP_PILOT_LAUNCH_HQ_CHAIN,
    },
  }
  const technicalEstate = {
    schemaVersion: 'supermega.technical-estate.v1',
    canonicalSource: { repository: REPOSITORY },
    products: REQUIRED_PRODUCTS.map((productId) => ({ productId })),
    lifecycle: { currentPriority: 'shop-first-managed-pilot-readiness', nextProductSequence: [...REQUIRED_PRODUCTS] },
    ownerGates: {
      productionWritesAllowed: false,
      externalEffectsAllowed: false,
      localSubagentsAllowedByDefault: false,
    },
  }
  const readiness = {
    contract: 'supermega.managed-pilot-readiness.v5',
    pilotMode: 'owner_named',
    overall: {
      status: 'blocked',
      hostedActivationReady: false,
      blockingGateCount: REQUIRED_BLOCKING_GATES.length,
      blockingGateIds: [...REQUIRED_BLOCKING_GATES],
    },
    liveProduction: { operatingMode: 'isolated_demo', managedWritesEnabled: false, productionMutationAuthorized: false },
    previewRehearsal: {
      proofComplete: false,
      productionRefsRejected: true,
      productionDataRejected: true,
      privilegedRuntimeCredentialsRejected: true,
    },
    pilotEvidence: {
      pilotMode: 'owner_named',
      productId: 'shop',
      proofComplete: false,
      requiredAcceptedConsecutiveRuns: 20,
      acceptedConsecutiveRuns: 0,
      syntheticEvidenceAccepted: false,
      publicIdentityAllowed: false,
      privateWorkspaceRequired: true,
    },
    controls: {
      externalWritesPerformed: false,
      productionWritesEnabled: false,
      ownerApprovalRequired: true,
      forbiddenUntilReady: [...REQUIRED_FORBIDDEN_ACTIONS],
    },
  }
  const publicBoundary = {
    contract: 'supermega.shop.pilot_public_boundary.v1',
    product: 'shop',
    pilotMode: 'owner_named',
    stage: 'owner-decision-required',
    decision: 'revise',
    controls: Object.fromEntries(PUBLIC_BOUNDARY_FALSE_CONTROLS.map((key) => [key, false])),
    acceptedRuns: 0,
    consecutiveAcceptedRuns: 0,
    participantIdentityPresent: false,
    secretValuesExposed: false,
  }
  return {
    generatedAt: '2026-08-25T00:00:00.000Z',
    repository: REPOSITORY,
    packageManifest,
    technicalEstate,
    readiness,
    publicBoundary,
    publicBoundaryVerification: {
      ok: true,
      fileDigests: [`sha256:${'d'.repeat(64)}`],
      externalWritesPerformed: false,
      customerContactPerformed: false,
    },
    gitState: {
      branch: 'codex/release-stack-integration-rehearsal',
      head: 'a'.repeat(40),
      clean: true,
      originMain: 'b'.repeat(40),
      aheadOfOriginMain: 5,
      diffShortstat: ' 10 files changed, 200 insertions(+), 4 deletions(-)',
    },
    ...overrides,
  }
}

function runSelfTest() {
  const valid = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput())
  const dirty = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    gitState: { ...sampleShopPilotLaunchGateInput().gitState, clean: false },
  }))
  const syntheticProof = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    readiness: {
      ...sampleShopPilotLaunchGateInput().readiness,
      pilotEvidence: { ...sampleShopPilotLaunchGateInput().readiness.pilotEvidence, syntheticEvidenceAccepted: true },
    },
  }))
  const contactAllowed = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    publicBoundary: {
      ...sampleShopPilotLaunchGateInput().publicBoundary,
      controls: { ...sampleShopPilotLaunchGateInput().publicBoundary.controls, customerContactPerformed: true },
    },
  }))
  const checks = {
    valid_candidate_is_private_intake_only: valid.ok === true && validateShopPilotLaunchGate(valid) === valid,
    dirty_worktree_fails_closed: dirty.ok === false && dirty.failures.includes('shop_pilot_launch_gate_worktree_dirty'),
    synthetic_proof_fails_closed: syntheticProof.ok === false && syntheticProof.failures.includes('shop_pilot_launch_gate_pilot_evidence_state_invalid'),
    contact_control_fails_closed: contactAllowed.ok === false && contactAllowed.failures.some((failure) => failure.startsWith('shop_pilot_launch_gate_public_boundary_invalid')),
    no_external_effects_allowed: Object.entries(valid.controls)
      .filter(([key]) => key !== 'noWriteVerification')
      .every(([, value]) => value === false),
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name)
  return {
    ok: failedChecks.length === 0,
    contract: `${SHOP_PILOT_LAUNCH_GATE_CONTRACT}.self-test`,
    checks,
    failedChecks,
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args[0] && !['--verify', '--self-test'].includes(args[0]))) {
    throw new Error('shop_pilot_launch_gate_usage_invalid')
  }
  if (args[0] === '--self-test') {
    const result = runSelfTest()
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return
  }
  const report = await currentReport()
  console.log(JSON.stringify({
    ok: report.ok,
    contract: report.contract,
    status: report.status,
    head: report.candidate.head,
    clean: report.candidate.clean,
    authority: report.launchReadiness.authority,
    requiredNextGateIds: report.requiredNextGates.map((gate) => gate.id),
    failures: report.failures,
  }, null, 2))
  if (!report.ok) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: SHOP_PILOT_LAUNCH_GATE_CONTRACT,
      error: String(error?.message || 'shop_pilot_launch_gate_failed').slice(0, 260),
      externalEffectsAllowed: false,
    }))
    process.exitCode = 1
  })
}

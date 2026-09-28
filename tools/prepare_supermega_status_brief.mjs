#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildCurrentOperatorBoard,
  validateCurrentOperatorBoard,
} from './prepare_current_operator_board.mjs'
import { buildGitHubMainProtectionSnapshot } from './collect_github_main_protection_snapshot.mjs'
import {
  OPERATING_ACTION_BOARD_CONTRACT,
  OPERATING_ACTION_BOARD_MODE,
  validateOperatingActionBoard,
} from '../kernel/operating-action-board.mjs'

export const SUPERMEGA_STATUS_BRIEF_CONTRACT = 'supermega.status-brief.v1'
export const SUPERMEGA_STATUS_BRIEF_MODE = 'local_no_external_effects'

const root = resolve(import.meta.dirname, '..')
const DEFAULT_ACTION_BOARD = resolve(root, 'hq', 'operating-action-board.json')
const PRODUCT_IDS = ['shop', 'plant', 'website', 'ecommerce']
const OPEN_ACTION_STATUSES = new Set(['proposed', 'owner-gated', 'open', 'blocked'])
const SEVERITY_RANK = new Map([
  ['critical', 0],
  ['high', 1],
  ['medium', 2],
  ['low', 3],
])
const STATUS_RANK = new Map([
  ['owner-gated', 0],
  ['blocked', 1],
  ['open', 2],
  ['proposed', 3],
  ['closed', 4],
  ['rejected', 5],
])
const CONTROL_FIELDS = [
  'externalWritesPerformed',
  'gitRemoteWritesPerformed',
  'githubWritesPerformed',
  'vercelDeploymentsPerformed',
  'supabaseMutationsPerformed',
  'credentialValuesInspected',
  'customerContactPerformed',
  'paymentOrStockActionPerformed',
  'managedActivationPerformed',
  'privateIdentityExposed',
]
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^"\s]+/i,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
]

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function sha256(value) {
  return createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')
}

function digest(value) {
  return `sha256:${sha256(value)}`
}

function exactDigest(value, code) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) fail(code)
  return normalized
}

function assertTimestamp(value, code) {
  const normalized = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(normalized)
    || Number.isNaN(Date.parse(normalized))) {
    fail(code)
  }
  return normalized
}

function assertLine(value, maxLength, code) {
  const normalized = String(value || '').trim()
  if (!normalized || normalized.length > maxLength || /[\r\n\u0000-\u001f\u007f]/.test(normalized)) fail(code)
  assertNoSecretShape(normalized, code)
  return normalized
}

function assertNoSecretShape(value, code = 'supermega_status_brief_secret_shape') {
  const text = JSON.stringify(value || {})
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) fail(code)
}

function assertControlsFalse(controls, code) {
  if (!isRecord(controls)) fail(code)
  for (const field of CONTROL_FIELDS) {
    if (controls[field] !== false) fail(code)
  }
}

function buildControls(operatorBoard, actionBoard) {
  assertControlsFalse(operatorBoard.controls, 'supermega_status_brief_operator_controls_invalid')
  assertControlsFalse(actionBoard.controls, 'supermega_status_brief_action_controls_invalid')
  if (operatorBoard.controls.localSubagentsStarted !== false) fail('supermega_status_brief_local_subagents_invalid')
  return Object.fromEntries(CONTROL_FIELDS.map((field) => [field, false]))
}

function actionIsSatisfiedByReleaseGate(action, operatorBoard) {
  if (action?.id !== 'release-main-protection') return false
  const mainProtectionGate = operatorBoard?.gates?.find((gate) => gate?.id === 'github_main_protection')
  return mainProtectionGate?.status === 'satisfied'
}

function selectCurrentOperatingAction(actions, operatorBoard) {
  const openActions = actions.filter((action) =>
    OPEN_ACTION_STATUSES.has(action.status) && !actionIsSatisfiedByReleaseGate(action, operatorBoard))
  if (!openActions.length) return null
  return [...openActions].sort((a, b) => {
    const severity = (SEVERITY_RANK.get(a.severity) ?? 99) - (SEVERITY_RANK.get(b.severity) ?? 99)
    if (severity !== 0) return severity
    const status = (STATUS_RANK.get(a.status) ?? 99) - (STATUS_RANK.get(b.status) ?? 99)
    if (status !== 0) return status
    return a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id)
  })[0]
}

function buildNextWork({ operatorBoard, actionBoard, currentOperatingAction }) {
  const next = []
  if (operatorBoard.currentAction?.gateId !== 'none') {
    next.push({
      id: `gate-${operatorBoard.currentAction.gateId}`,
      kind: 'owner_or_release_gate',
      productIds: [...PRODUCT_IDS],
      ownerRole: 'Founder plus Engineering',
      action: assertLine(operatorBoard.currentAction.nextAction, 240, 'supermega_status_brief_release_next_invalid'),
      ownerApprovalRequired: Boolean(operatorBoard.currentAction.requiredApprovalEnv),
      approvalEnv: operatorBoard.currentAction.requiredApprovalEnv || null,
      externalWriteAllowed: false,
    })
  }
  const currentOperatingActionAlreadyRepresentedByReleaseGate = operatorBoard.currentAction?.gateId === 'github_main_protection'
    && currentOperatingAction?.id === 'release-main-protection'
  if (currentOperatingAction && !currentOperatingActionAlreadyRepresentedByReleaseGate) {
    next.push({
      id: `action-${currentOperatingAction.id}`,
      kind: 'operating_action',
      productIds: currentOperatingAction.productIds,
      ownerRole: currentOperatingAction.owner.role,
      action: currentOperatingAction.recommendation,
      ownerApprovalRequired: currentOperatingAction.authority.ownerApprovalRequired,
      approvalEnv: null,
      externalWriteAllowed: false,
    })
  }
  const shopBaseline = actionBoard.actions.find((action) => action.id === 'shop-owner-pilot-baseline')
  if (shopBaseline && (!currentOperatingAction || shopBaseline.id !== currentOperatingAction.id)) {
    next.push({
      id: `action-${shopBaseline.id}`,
      kind: 'shop_pilot_revenue_path',
      productIds: ['shop'],
      ownerRole: shopBaseline.owner.role,
      action: shopBaseline.recommendation,
      ownerApprovalRequired: shopBaseline.authority.ownerApprovalRequired,
      approvalEnv: null,
      externalWriteAllowed: false,
    })
  }
  if (!next.length) fail('supermega_status_brief_next_work_missing')
  return next.slice(0, 3)
}

function normalizeActionSummary(action) {
  if (!action) return null
  return {
    id: action.id,
    status: action.status,
    severity: action.severity,
    productIds: action.productIds,
    ownerRole: action.owner.role,
    dueDate: action.dueDate,
    recommendation: action.recommendation,
    evidenceRef: action.sourceFinding.evidenceRef,
    evidenceDigest: action.sourceFinding.evidenceDigest,
    ownerApprovalRequired: action.authority.ownerApprovalRequired,
    externalWriteAllowed: false,
  }
}

export function buildSuperMegaStatusBrief({
  generatedAt,
  operatorBoard,
  operatingActionBoard,
  operatorBoardFileDigest,
  operatingActionBoardFileDigest,
} = {}) {
  const operator = validateCurrentOperatorBoard(operatorBoard)
  const actionBoard = validateOperatingActionBoard(operatingActionBoard)
  const generated = assertTimestamp(generatedAt || new Date().toISOString(), 'supermega_status_brief_generated_at_invalid')
  exactDigest(operatorBoardFileDigest || operator.digest, 'supermega_status_brief_operator_digest_invalid')
  exactDigest(operatingActionBoardFileDigest || actionBoard.digest, 'supermega_status_brief_action_digest_invalid')
  if (operator.products.customerProducts.join(',') !== PRODUCT_IDS.join(',')) fail('supermega_status_brief_products_invalid')
  if (actionBoard.products.join(',') !== PRODUCT_IDS.join(',')) fail('supermega_status_brief_action_products_invalid')
  if (operator.products.aiIsSharedCapability !== true || operator.products.sharedCapabilities.includes('ai')) {
    fail('supermega_status_brief_ai_boundary_invalid')
  }
  if (operator.live.operatingMode !== 'isolated_demo' || operator.live.managedWritesEnabled !== false) {
    fail('supermega_status_brief_live_mode_invalid')
  }

  const currentOperatingAction = selectCurrentOperatingAction(actionBoard.actions, operator)
  const controls = buildControls(operator, actionBoard)
  const nextWork = buildNextWork({ operatorBoard: operator, actionBoard, currentOperatingAction })
  const releaseBlockers = Array.isArray(operator.currentAction.blockers)
    ? operator.currentAction.blockers.map((entry) => assertLine(entry, 180, 'supermega_status_brief_blocker_invalid'))
    : []
  const openActionIds = actionBoard.actions
    .filter((action) => OPEN_ACTION_STATUSES.has(action.status))
    .map((action) => action.id)

  const briefWithoutDigest = {
    contract: SUPERMEGA_STATUS_BRIEF_CONTRACT,
    generatedAt: generated,
    mode: SUPERMEGA_STATUS_BRIEF_MODE,
    repository: operator.repository,
    release: {
      candidateBranch: operator.candidate.branch,
      candidateCommit: operator.candidate.commit,
      candidateClean: operator.candidate.clean,
      candidateAheadOfMain: operator.candidate.aheadOfMain,
      candidateAheadOfLive: operator.candidate.aheadOfLive,
      liveCommit: operator.live.commit,
      remoteMainCommit: operator.remote.mainCommit,
      remoteCandidateState: operator.remote.candidateBranchState,
      currentGateId: operator.currentAction.gateId,
      currentGateLabel: operator.currentAction.label,
      currentGateStatus: operator.gates.find((gate) => gate.id === operator.currentAction.gateId)?.status || 'unknown',
      requiredApprovalEnv: operator.currentAction.requiredApprovalEnv || null,
      blockers: releaseBlockers,
    },
    products: {
      customerProducts: [...PRODUCT_IDS],
      firstPilotProduct: operator.products.firstPilotProduct,
      nextProductSequence: operator.products.nextProductSequence,
      liveOperatingMode: operator.live.operatingMode,
      managedWritesEnabled: false,
      aiBoundary: 'shared_capability_not_product',
    },
    operatingActions: {
      boardContract: OPERATING_ACTION_BOARD_CONTRACT,
      boardMode: OPERATING_ACTION_BOARD_MODE,
      boardDigest: actionBoard.digest,
      fileDigest: operatingActionBoardFileDigest || actionBoard.digest,
      totalActions: actionBoard.weeklyReport.totalActions,
      openActionCount: actionBoard.weeklyReport.openActionCount,
      closedActionCount: actionBoard.weeklyReport.closedActionCount,
      ownerGatedCount: actionBoard.weeklyReport.ownerGatedCount,
      criticalOpenCount: actionBoard.weeklyReport.criticalOpenCount,
      measuredResultCount: actionBoard.weeklyReport.measuredResultCount,
      openActionIds,
      currentOperatingAction: normalizeActionSummary(currentOperatingAction),
    },
    sourceReceipts: {
      operatorBoardDigest: operator.digest,
      operatorBoardFileDigest: operatorBoardFileDigest || operator.digest,
      operatingActionBoardDigest: actionBoard.digest,
      operatingActionBoardFileDigest: operatingActionBoardFileDigest || actionBoard.digest,
    },
    nextWork,
    controls,
  }
  assertNoSecretShape(briefWithoutDigest)
  return {
    ...briefWithoutDigest,
    digest: digest(stableStringify(briefWithoutDigest)),
  }
}

export function validateSuperMegaStatusBrief(brief) {
  assertNoSecretShape(brief)
  if (!isRecord(brief)) fail('supermega_status_brief_invalid')
  if (brief.contract !== SUPERMEGA_STATUS_BRIEF_CONTRACT) fail('supermega_status_brief_contract_invalid')
  if (brief.mode !== SUPERMEGA_STATUS_BRIEF_MODE) fail('supermega_status_brief_mode_invalid')
  assertTimestamp(brief.generatedAt, 'supermega_status_brief_generated_at_invalid')
  if (brief.repository !== 'swanhtet01/swanhtet01.github.io') fail('supermega_status_brief_repository_invalid')
  if (!isRecord(brief.release) || !isRecord(brief.products) || !isRecord(brief.operatingActions)
    || !isRecord(brief.sourceReceipts) || !Array.isArray(brief.nextWork)) {
    fail('supermega_status_brief_shape_invalid')
  }
  if (brief.products.customerProducts?.join(',') !== PRODUCT_IDS.join(',')
    || brief.products.nextProductSequence?.join(',') !== PRODUCT_IDS.join(',')
    || brief.products.firstPilotProduct !== 'shop'
    || brief.products.aiBoundary !== 'shared_capability_not_product'
    || brief.products.managedWritesEnabled !== false) {
    fail('supermega_status_brief_products_invalid')
  }
  if (brief.release.candidateClean !== true
    || !brief.release.currentGateId
    || !Array.isArray(brief.release.blockers)) {
    fail('supermega_status_brief_release_invalid')
  }
  if (brief.operatingActions.boardContract !== OPERATING_ACTION_BOARD_CONTRACT
    || brief.operatingActions.boardMode !== OPERATING_ACTION_BOARD_MODE
    || brief.operatingActions.openActionCount !== brief.operatingActions.openActionIds.length
    || brief.operatingActions.totalActions < brief.operatingActions.openActionCount
    || brief.operatingActions.criticalOpenCount < 0) {
    fail('supermega_status_brief_actions_invalid')
  }
  if (!brief.operatingActions.currentOperatingAction) fail('supermega_status_brief_current_action_missing')
  exactDigest(brief.operatingActions.boardDigest, 'supermega_status_brief_action_digest_invalid')
  exactDigest(brief.operatingActions.fileDigest, 'supermega_status_brief_action_file_digest_invalid')
  exactDigest(brief.sourceReceipts.operatorBoardDigest, 'supermega_status_brief_operator_digest_invalid')
  exactDigest(brief.sourceReceipts.operatorBoardFileDigest, 'supermega_status_brief_operator_file_digest_invalid')
  exactDigest(brief.digest, 'supermega_status_brief_digest_invalid')
  if (brief.nextWork.length < 1 || brief.nextWork.length > 3) fail('supermega_status_brief_next_work_invalid')
  for (const item of brief.nextWork) {
    if (!item || item.externalWriteAllowed !== false || !Array.isArray(item.productIds) || !item.action) {
      fail('supermega_status_brief_next_work_invalid')
    }
  }
  assertControlsFalse(brief.controls, 'supermega_status_brief_controls_invalid')
  const copy = { ...brief }
  delete copy.digest
  if (brief.digest !== digest(stableStringify(copy))) fail('supermega_status_brief_digest_mismatch')
  return brief
}

export function renderSuperMegaStatusBriefMarkdown(brief) {
  validateSuperMegaStatusBrief(brief)
  const blockers = brief.release.blockers.length
    ? brief.release.blockers.slice(0, 10).map((blocker) => `- ${blocker}`).join('\n')
    : '- none'
  const nextWork = brief.nextWork
    .map((item, index) => `${index + 1}. ${item.action} (${item.ownerRole}; approval: ${item.ownerApprovalRequired ? item.approvalEnv || 'owner record required' : 'not required'})`)
    .join('\n')
  return [
    '# SuperMega Status Brief',
    '',
    `Contract: \`${brief.contract}\``,
    `Digest: \`${brief.digest}\``,
    `Mode: \`${brief.mode}\``,
    '',
    '## What is happening now',
    '',
    `Current release gate: ${brief.release.currentGateLabel} (\`${brief.release.currentGateId}\`)`,
    `Candidate: \`${brief.release.candidateBranch}\` at \`${brief.release.candidateCommit}\``,
    `Live: \`${brief.release.liveCommit}\`; remote main: \`${brief.release.remoteMainCommit}\``,
    `Production mode: \`${brief.products.liveOperatingMode}\`; managed writes: \`${brief.products.managedWritesEnabled}\``,
    '',
    '## Why it is not live-selling yet',
    '',
    blockers,
    '',
    '## Product order',
    '',
    `Customer products: ${brief.products.customerProducts.join(', ')}`,
    `Next sequence: ${brief.products.nextProductSequence.join(' → ')}`,
    'AI is a shared capability, not a fifth product.',
    '',
    '## Operating actions',
    '',
    `Open: ${brief.operatingActions.openActionCount}/${brief.operatingActions.totalActions}; owner-gated: ${brief.operatingActions.ownerGatedCount}; critical open: ${brief.operatingActions.criticalOpenCount}; measured results: ${brief.operatingActions.measuredResultCount}`,
    `Current operating action: ${brief.operatingActions.currentOperatingAction.id} — ${brief.operatingActions.currentOperatingAction.recommendation}`,
    '',
    '## Next work',
    '',
    nextWork,
    '',
    '## Safety controls',
    '',
    'All external writes, Git remote writes, GitHub writes, Vercel deployments, Supabase mutations, credential inspection, customer contact, payment/stock actions, managed activation, and private identity exposure remain false.',
  ].join('\n')
}

async function readJsonReceipt(path, validate, code) {
  const absolute = resolve(path || '')
  const text = await readFile(absolute, 'utf8')
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    fail(`${code}_json_invalid`)
  }
  validate(parsed)
  return {
    path: absolute,
    fileDigest: digest(text),
    packet: parsed,
  }
}

async function prepareSuperMegaStatusBrief({
  operatorBoardPath,
  operatingActionBoardPath,
  outputPath = null,
  markdownOutputPath = null,
} = {}) {
  const operatorReceipt = await readJsonReceipt(operatorBoardPath, validateCurrentOperatorBoard, 'supermega_status_brief_operator')
  const actionReceipt = await readJsonReceipt(operatingActionBoardPath || DEFAULT_ACTION_BOARD, validateOperatingActionBoard, 'supermega_status_brief_action')
  const brief = buildSuperMegaStatusBrief({
    operatorBoard: operatorReceipt.packet,
    operatingActionBoard: actionReceipt.packet,
    operatorBoardFileDigest: operatorReceipt.fileDigest,
    operatingActionBoardFileDigest: actionReceipt.fileDigest,
  })
  const json = `${JSON.stringify(brief, null, 2)}\n`
  if (outputPath) {
    const absolute = resolve(outputPath)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, json, { encoding: 'utf8' })
  }
  if (markdownOutputPath) {
    const absolute = resolve(markdownOutputPath)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, `${renderSuperMegaStatusBriefMarkdown(brief)}\n`, { encoding: 'utf8' })
  }
  return brief
}

async function readAndValidateBrief(path) {
  const text = await readFile(resolve(path || ''), 'utf8')
  return validateSuperMegaStatusBrief(JSON.parse(text))
}

const sampleDigest = (char) => `sha256:${char.repeat(64)}`

function sampleOperatorBoard() {
  const commit = 'a'.repeat(40)
  const main = 'b'.repeat(40)
  const live = 'c'.repeat(40)
  const branch = 'codex/release-stack-integration-rehearsal-20260825'
  const githubProtectionSnapshot = buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-08-25T00:00:00.000Z',
    branch: {
      name: 'main',
      protected: false,
      commit: { sha: main },
      protection: { enabled: false, required_status_checks: { contexts: [], checks: [] } },
    },
    rulesets: [],
  })
  return buildCurrentOperatorBoard({
    handoffReceipt: {
      path: 'handoff.json',
      digest: sampleDigest('0'),
      packet: {
        generatedAt: '2026-08-25T00:00:00.000Z',
        repository: 'swanhtet01/swanhtet01.github.io',
        candidate: { branch, commit, clean: true },
        remote: { mainCommit: main, candidateBranchState: 'unpublished', candidateCommit: null },
        live: { canonicalPair: ['https://supermega.dev', 'https://app.supermega.dev'], identity: { commit: live } },
        relations: { candidateAheadOfMain: 59, candidateAheadOfLive: 61 },
        verification: { workflowAuthority: { workflowDigest: sampleDigest('d') } },
        digest: sampleDigest('e'),
      },
    },
    technicalEstate: {
      products: PRODUCT_IDS.map((productId) => ({ productId })),
      lifecycle: { nextProductSequence: [...PRODUCT_IDS] },
      sharedCapabilities: [{ id: 'ai-assistance', classification: 'shared-capability-not-product' }],
    },
    readiness: {
      contract: 'supermega.managed-pilot-readiness.v5',
      pilotMode: 'owner_named',
      overall: { hostedActivationReady: false, blockingGateIds: ['preview_rehearsal', 'pilot_evidence', 'production_activation'] },
      liveProduction: { operatingMode: 'isolated_demo', managedWritesEnabled: false },
      pilotEvidence: {
        proofComplete: false,
        acceptedConsecutiveRuns: 0,
        requiredAcceptedConsecutiveRuns: 20,
        requiredPilotDayIndexes: [1, 2, 3, 4, 5],
        acceptedConsecutivePilotDayIndexes: [],
        pilotSequenceCoverageMet: false,
        requiredPilotCalendarDates: 5,
        acceptedConsecutiveObservedDateCount: 0,
        acceptedConsecutiveObservedDates: [],
        pilotCalendarCoverageMet: false,
      },
    },
    githubProposalReceipt: { path: 'github.json', digest: sampleDigest('1'), packet: { digest: sampleDigest('2') } },
    githubProtectionSnapshot,
    supabaseProposalReceipt: {
      path: 'supabase.json',
      digest: sampleDigest('3'),
      packet: {
        contract: 'supermega.supabase-preview-rehearsal-proposal.v1',
        mode: 'owner_approval_required',
        state: 'prepared-not-executed',
        digest: sampleDigest('4'),
        previewBranch: { maximumLifetimeHours: 24 },
        migrationPlan: { productionApplyAllowed: false, chainDigest: sampleDigest('5') },
        controls: { providerMutationsPerformed: false },
      },
    },
    githubApplyPlan: {
      contract: 'supermega.github-main-protection-apply.v1',
      mode: 'plan_only_no_github_write',
      candidate: {
        branch,
        head: commit,
        clean: true,
        expectedHead: commit,
        expectedHeadMatched: true,
        expectedHeadRequiredForExecute: true,
      },
      approval: { env: 'SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL', approved: false, expectedDigest: sampleDigest('6') },
      token: { present: false },
      possibleWrite: { create: 'POST /repos/swanhtet01/swanhtet01.github.io/rulesets' },
      controls: { githubWritesPerformed: false },
    },
    branchPushPlan: {
      contract: 'supermega.review-branch-push-apply.v2',
      mode: 'plan_only_no_git_remote_write',
      candidate: { clean: true },
      approval: { env: null, method: 'none', approved: false, expectedDigest: sampleDigest('7') },
      possibleWrite: { kind: 'initial_branch_push' },
      controls: { gitRemoteWritesPerformed: false },
    },
    pullRequestPlan: {
      contract: 'supermega.release-pull-request-apply.v1',
      mode: 'plan_only_no_github_write',
      approval: { env: 'SUPERMEGA_PULL_REQUEST_CREATION_APPROVAL', approved: false, expectedDigest: sampleDigest('8') },
      readiness: { executeReady: false, blockers: ['remote_review_branch_not_exact', 'owner_approval_missing', 'github_token_missing'] },
      possibleWrite: { payloadDigest: sampleDigest('9') },
      controls: { githubWritesPerformed: false },
    },
    gitState: { branch, head: commit, clean: true },
  })
}

function sampleAction(overrides = {}) {
  return {
    id: 'release-main-protection',
    openedAt: '2026-08-25T00:00:00.000Z',
    productIds: [...PRODUCT_IDS],
    sourceFinding: {
      sourceType: 'release_gate',
      label: 'GitHub main protection is not verified',
      evidenceRef: 'supermega.github-main-protection-snapshot.v63.generated-20260825.json',
      evidenceDigest: sampleDigest('a'),
    },
    recommendation: 'Protect GitHub main before branch push, pull request, release, or pilot activation.',
    severity: 'critical',
    businessImpact: {
      kind: 'release_risk',
      estimateLabel: 'Unprotected main can invalidate owner-gated release authority.',
      measured: false,
    },
    owner: { role: 'Founder plus Engineering', namedPrivate: false },
    dueDate: '2026-08-25',
    status: 'owner-gated',
    authority: { ownerApprovalRequired: true, externalWriteAllowed: false },
    acceptance: {
      evidenceRequired: ['Verified main protection snapshot with required checks present'],
      tests: ['npm run hq:verify'],
    },
    closure: { closedAt: null, closureNote: null, measuredResult: null },
    ...overrides,
  }
}

function sampleActionBoard(overrides = {}) {
  const actions = overrides.actions || [sampleAction()]
  return {
    contract: OPERATING_ACTION_BOARD_CONTRACT,
    generatedAt: '2026-08-25T00:00:00.000Z',
    mode: OPERATING_ACTION_BOARD_MODE,
    products: [...PRODUCT_IDS],
    controls: Object.fromEntries(CONTROL_FIELDS.map((field) => [field, false])),
    weeklyReport: {
      totalActions: actions.length,
      openActionCount: actions.filter((action) => OPEN_ACTION_STATUSES.has(action.status)).length,
      closedActionCount: actions.filter((action) => action.status === 'closed').length,
      ownerGatedCount: actions.filter((action) => action.status === 'owner-gated').length,
      criticalOpenCount: actions.filter((action) => action.severity === 'critical' && OPEN_ACTION_STATUSES.has(action.status)).length,
      measuredResultCount: actions.filter((action) => action.status === 'closed' && action.businessImpact.measured === true).length,
      closedCycleTimeDaysMedian: null,
    },
    ...overrides,
    actions,
  }
}

function runSelfTest() {
  const brief = buildSuperMegaStatusBrief({
    generatedAt: '2026-08-25T00:00:00.000Z',
    operatorBoard: sampleOperatorBoard(),
    operatingActionBoard: sampleActionBoard(),
    operatorBoardFileDigest: sampleDigest('b'),
    operatingActionBoardFileDigest: sampleDigest('c'),
  })
  validateSuperMegaStatusBrief(brief)
  const markdown = renderSuperMegaStatusBriefMarkdown(brief)
  if (!markdown.includes('What is happening now') || !markdown.includes('AI is a shared capability')) {
    fail('supermega_status_brief_self_test_markdown_invalid')
  }
  try {
    buildSuperMegaStatusBrief({
      generatedAt: '2026-08-25T00:00:00.000Z',
      operatorBoard: {
        ...sampleOperatorBoard(),
        controls: { ...sampleOperatorBoard().controls, githubWritesPerformed: true },
      },
      operatingActionBoard: sampleActionBoard(),
    })
  } catch (error) {
    if (String(error?.message || '') !== 'current_operator_board_control_not_false:githubWritesPerformed') throw error
    return {
      ok: true,
      contract: SUPERMEGA_STATUS_BRIEF_CONTRACT,
      cases: 2,
      digest: brief.digest,
    }
  }
  fail('supermega_status_brief_self_test_failed')
}

function parseArgs(argv) {
  const args = {
    operatorBoardPath: null,
    operatingActionBoardPath: DEFAULT_ACTION_BOARD,
    outputPath: null,
    markdownOutputPath: null,
    verifyPath: null,
    selfTest: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--operator-board') args.operatorBoardPath = argv[++index]
    else if (arg === '--operating-action-board') args.operatingActionBoardPath = argv[++index]
    else if (arg === '--output') args.outputPath = argv[++index]
    else if (arg === '--markdown-output') args.markdownOutputPath = argv[++index]
    else if (arg === '--verify') args.verifyPath = argv[++index] || null
    else if (arg === '--self-test') args.selfTest = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else fail(`supermega_status_brief_unknown_arg:${arg}`)
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Usage: node tools/prepare_supermega_status_brief.mjs --operator-board <current-operator-board.json> [--operating-action-board hq/operating-action-board.json] [--output <brief.json>] [--markdown-output <brief.md>]')
    console.log('       node tools/prepare_supermega_status_brief.mjs --verify <brief.json>')
    console.log('       node tools/prepare_supermega_status_brief.mjs --self-test')
    return
  }
  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2))
    return
  }
  if (args.verifyPath) {
    const brief = await readAndValidateBrief(args.verifyPath)
    console.log(JSON.stringify({
      ok: true,
      contract: brief.contract,
      path: resolve(args.verifyPath),
      digest: brief.digest,
      currentGateId: brief.release.currentGateId,
      currentOperatingActionId: brief.operatingActions.currentOperatingAction.id,
      nextWorkCount: brief.nextWork.length,
      controls: brief.controls,
    }, null, 2))
    return
  }
  if (!args.operatorBoardPath) fail('supermega_status_brief_operator_board_required')
  const brief = await prepareSuperMegaStatusBrief(args)
  if (!args.outputPath && !args.markdownOutputPath) console.log(JSON.stringify(brief, null, 2))
  else {
    console.log(JSON.stringify({
      ok: true,
      contract: brief.contract,
      output: args.outputPath ? resolve(args.outputPath) : null,
      markdownOutput: args.markdownOutputPath ? resolve(args.markdownOutputPath) : null,
      digest: brief.digest,
      currentGateId: brief.release.currentGateId,
      currentOperatingActionId: brief.operatingActions.currentOperatingAction.id,
      controls: brief.controls,
    }, null, 2))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.message || error)
    process.exit(1)
  })
}

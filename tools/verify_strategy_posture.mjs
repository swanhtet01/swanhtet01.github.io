#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const STRATEGY_POSTURE_CONTRACT = 'supermega.strategy-posture-verifier.v1'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const DEFAULT_PATHS = {
  readiness: resolve(root, 'hq', 'readiness', 'managed-pilot-readiness.json'),
  aiNative: resolve(root, 'hq', 'strategy', 'AI-NATIVE-ARCHITECTURE.md'),
  competitiveCut: resolve(root, 'hq', 'strategy', 'COMPETITIVE-EXECUTION-CUT.md'),
  clientReadiness: resolve(root, 'hq', 'strategy', 'CLIENT-READINESS-BRIEF.md'),
}
const REQUIRED_PILOT_DAY_INDEXES = Object.freeze([1, 2, 3, 4, 5])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function has(text, fragment) {
  const normalizedText = String(text || '').replace(/\s+/g, ' ').trim()
  const normalizedFragment = String(fragment || '').replace(/\s+/g, ' ').trim()
  return normalizedText.includes(normalizedFragment)
}

function addIf(condition, failures, code) {
  if (condition) failures.push(code)
}

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index])
}

function assertNoActiveStaleSchemaClaims(text, failures, { liveSchemaVersion }) {
  const staleFragments = [
    'private schema v7 live',
    'v8-v10 code-only',
    'Production is at v10',
    'production is at v10',
  ]
  if (liveSchemaVersion !== 10) {
    staleFragments.push('production schema v10 observed')
    staleFragments.push('current v10 production parity')
    staleFragments.push('prove v10 parity')
  }
  for (const fragment of staleFragments) {
    addIf(has(text, fragment), failures, `strategy_posture_stale_claim:${fragment}`)
  }
}

export function buildStrategyPostureReport(input = {}) {
  const failures = []
  const readiness = input.readiness
  const aiNative = String(input.aiNative || '')
  const competitiveCut = String(input.competitiveCut || '')
  const clientReadiness = String(input.clientReadiness || '')

  addIf(!isRecord(readiness), failures, 'strategy_posture_readiness_missing')
  const liveSchemaVersion = Number(readiness?.liveProduction?.schemaVersion)
  const localTargetVersion = Number(readiness?.liveProduction?.localTargetVersion)
  const securityLiveSchemaVersion = Number(readiness?.securityAudit?.liveSchemaVersion)
  const requiredRuns = Number(readiness?.pilotEvidence?.requiredAcceptedConsecutiveRuns)
  const requiredPilotDayIndexes = readiness?.pilotEvidence?.requiredPilotDayIndexes
  const acceptedConsecutivePilotDayIndexes = readiness?.pilotEvidence?.acceptedConsecutivePilotDayIndexes

  addIf(readiness?.contract !== 'supermega.managed-pilot-readiness.v5', failures, 'strategy_posture_readiness_contract_invalid')
  addIf(readiness?.pilotMode !== 'owner_named', failures, 'strategy_posture_pilot_mode_not_owner_named')
  addIf(!Number.isInteger(liveSchemaVersion), failures, 'strategy_posture_live_schema_version_invalid')
  addIf(liveSchemaVersion !== localTargetVersion, failures, 'strategy_posture_schema_drift_present')
  addIf(liveSchemaVersion !== securityLiveSchemaVersion, failures, 'strategy_posture_security_schema_mismatch')
  addIf(readiness?.liveProduction?.versionDrift !== 0, failures, 'strategy_posture_version_drift_nonzero')
  addIf(readiness?.liveProduction?.browserRolesDenied !== true, failures, 'strategy_posture_browser_roles_not_denied')
  addIf(readiness?.liveProduction?.publicBrowserQuarantine !== true, failures, 'strategy_posture_public_browser_quarantine_missing')
  addIf(readiness?.liveProduction?.managedWritesEnabled !== false, failures, 'strategy_posture_managed_writes_not_disabled')
  addIf(readiness?.pilotEvidence?.productId !== 'shop', failures, 'strategy_posture_pilot_product_not_shop')
  addIf(requiredRuns !== 20, failures, 'strategy_posture_required_runs_not_20')
  addIf(!sameArray(requiredPilotDayIndexes, REQUIRED_PILOT_DAY_INDEXES), failures, 'strategy_posture_required_pilot_days_invalid')
  addIf(!sameArray(acceptedConsecutivePilotDayIndexes, []), failures, 'strategy_posture_accepted_pilot_days_should_be_empty')
  addIf(readiness?.pilotEvidence?.pilotSequenceCoverageMet !== false, failures, 'strategy_posture_pilot_sequence_coverage_claimed')
  addIf(readiness?.pilotEvidence?.syntheticEvidenceAccepted !== false, failures, 'strategy_posture_synthetic_evidence_accepted')
  addIf(readiness?.pilotEvidence?.publicIdentityAllowed !== false, failures, 'strategy_posture_public_identity_allowed')

  addIf(!has(aiNative, 'Owner-named Shop pilot before self-serve onboarding'), failures, 'strategy_posture_ai_owner_named_section_missing')
  addIf(!has(aiNative, `production schema v${liveSchemaVersion} observed with the public-browser quarantine`), failures, 'strategy_posture_ai_schema_line_stale')
  addIf(!has(aiNative, `current v${liveSchemaVersion} production parity`), failures, 'strategy_posture_ai_parity_line_stale')
  addIf(!(has(aiNative, 'Self-serve remains a later') && has(aiNative, 'not the active activation route')), failures, 'strategy_posture_ai_self_serve_deferred_missing')
  addIf(!has(aiNative, '20 consecutive accepted receipt-and-anchor-bound runs covering pilot days 1 through 5'), failures, 'strategy_posture_ai_20_run_gate_missing')
  addIf(!has(aiNative, 'no public signup, claim-code provisioning, hosted tenant'), failures, 'strategy_posture_ai_no_signup_claim_missing')
  addIf(!has(aiNative, 'GitHub main protection verified, review-branch publication still owner-gated'), failures, 'strategy_posture_ai_review_branch_gate_missing')
  addIf(has(aiNative, 'Managed onboarding is SELF-SERVE'), failures, 'strategy_posture_ai_active_self_serve_claim')
  addIf(has(aiNative, 'Phase B -- first self-serve tenants'), failures, 'strategy_posture_ai_self_serve_phase_active')
  addIf(has(aiNative, 'GitHub main protection still owner-gated'), failures, 'strategy_posture_ai_stale_github_gate_claim')
  assertNoActiveStaleSchemaClaims(aiNative, failures, { liveSchemaVersion })

  for (const product of ['Shop', 'Plant', 'Website', 'Ecommerce']) {
    addIf(!has(competitiveCut, `${product}`), failures, `strategy_posture_competitive_cut_missing_product:${product}`)
  }
  addIf(!has(competitiveCut, 'AI is a shared capability, not a customer product'), failures, 'strategy_posture_competitive_cut_ai_boundary_missing')
  addIf(!has(competitiveCut, 'Shop remains the money-path product'), failures, 'strategy_posture_competitive_cut_shop_first_missing')
  addIf(!has(competitiveCut, `${requiredRuns} consecutive accepted observed runs covering pilot days 1 through 5`), failures, 'strategy_posture_competitive_cut_run_gate_missing')
  addIf(!has(competitiveCut, 'GitHub `main` protection is verified. The current first external gate is the exact review-branch push'), failures, 'strategy_posture_competitive_cut_review_branch_gate_missing')
  addIf(has(competitiveCut, 'The current first external gate is GitHub `main` protection'), failures, 'strategy_posture_competitive_cut_stale_github_gate_claim')
  addIf(!(has(competitiveCut, 'Plant, Website, and Ecommerce keep security, dependency, regression, and') && has(competitiveCut, 'handoff maintenance until Shop produces a decision packet')), failures, 'strategy_posture_competitive_cut_non_shop_sequence_missing')
  addIf(!has(competitiveCut, 'No deploy, provider write, credential'), failures, 'strategy_posture_competitive_cut_authority_warning_missing')

  addIf(!has(clientReadiness, 'Freshness note, 2026-08-26'), failures, 'strategy_posture_client_freshness_note_missing')
  assertNoActiveStaleSchemaClaims(clientReadiness, failures, { liveSchemaVersion })

  return {
    ok: failures.length === 0,
    contract: STRATEGY_POSTURE_CONTRACT,
    liveSchemaVersion,
    pilotMode: readiness?.pilotMode || null,
    productSequence: ['shop', 'plant', 'website', 'ecommerce'],
    requiredAcceptedConsecutiveRuns: requiredRuns,
    requiredPilotDayIndexes: Array.isArray(requiredPilotDayIndexes) ? [...requiredPilotDayIndexes] : [],
    acceptedConsecutivePilotDayIndexes: Array.isArray(acceptedConsecutivePilotDayIndexes) ? [...acceptedConsecutivePilotDayIndexes] : [],
    pilotSequenceCoverageMet: readiness?.pilotEvidence?.pilotSequenceCoverageMet === true,
    checkedDocuments: [
      'hq/strategy/AI-NATIVE-ARCHITECTURE.md',
      'hq/strategy/COMPETITIVE-EXECUTION-CUT.md',
      'hq/strategy/CLIENT-READINESS-BRIEF.md',
    ],
    failures,
    controls: {
      externalWritesPerformed: false,
      providerWritesPerformed: false,
      credentialValuesInspected: false,
      customerContactPerformed: false,
      managedActivationPerformed: false,
    },
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function runVerify(paths = DEFAULT_PATHS) {
  return buildStrategyPostureReport({
    readiness: await readJson(paths.readiness),
    aiNative: await readFile(paths.aiNative, 'utf8'),
    competitiveCut: await readFile(paths.competitiveCut, 'utf8'),
    clientReadiness: await readFile(paths.clientReadiness, 'utf8'),
  })
}

function runSelfTest() {
  const readiness = {
    contract: 'supermega.managed-pilot-readiness.v5',
    pilotMode: 'owner_named',
    liveProduction: {
      schemaVersion: 11,
      localTargetVersion: 11,
      versionDrift: 0,
      browserRolesDenied: true,
      publicBrowserQuarantine: true,
      managedWritesEnabled: false,
    },
    securityAudit: { liveSchemaVersion: 11 },
    pilotEvidence: {
      productId: 'shop',
      requiredAcceptedConsecutiveRuns: 20,
      requiredPilotDayIndexes: [...REQUIRED_PILOT_DAY_INDEXES],
      acceptedConsecutivePilotDayIndexes: [],
      pilotSequenceCoverageMet: false,
      syntheticEvidenceAccepted: false,
      publicIdentityAllowed: false,
    },
  }
  const aiNative = [
    '### 3.2 Owner-named Shop pilot before self-serve onboarding',
    'production schema v11 observed with the public-browser quarantine',
    'current v11 production parity',
    'Self-serve remains a later product expansion, not the active activation route',
    '20 consecutive accepted receipt-and-anchor-bound runs covering pilot days 1 through 5',
    'no public signup, claim-code provisioning, hosted tenant',
    'GitHub main protection verified, review-branch publication still owner-gated',
  ].join('\n')
  const competitiveCut = [
    'No deploy, provider write, credential',
    'Shop',
    'Plant',
    'Website',
    'Ecommerce',
    'AI is a shared capability, not a customer product',
    'Shop remains the money-path product',
    '20 consecutive accepted observed runs covering pilot days 1 through 5',
    'GitHub `main` protection is verified. The current first external gate is the exact review-branch push',
    'Plant, Website, and Ecommerce keep security, dependency, regression, and handoff maintenance until Shop produces a decision packet',
  ].join('\n')
  const clientReadiness = 'Freshness note, 2026-08-26\nProduction is at v11.'
  const good = buildStrategyPostureReport({ readiness, aiNative, competitiveCut, clientReadiness })
  const badSelfServe = buildStrategyPostureReport({
    readiness,
    aiNative: `${aiNative}\nManaged onboarding is SELF-SERVE`,
    competitiveCut,
    clientReadiness,
  })
  const badSchema = buildStrategyPostureReport({
    readiness,
    aiNative: aiNative.replace('v11', 'v10'),
    competitiveCut,
    clientReadiness,
  })
  const checks = {
    good_report_passes: good.ok === true,
    active_self_serve_claim_rejected: badSelfServe.ok === false && badSelfServe.failures.includes('strategy_posture_ai_active_self_serve_claim'),
    stale_schema_line_rejected: badSchema.ok === false && badSchema.failures.includes('strategy_posture_ai_schema_line_stale'),
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name)
  return {
    ok: failedChecks.length === 0,
    contract: `${STRATEGY_POSTURE_CONTRACT}.self-test`,
    checks,
    failedChecks,
    externalWritesPerformed: false,
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--self-test') {
    const result = runSelfTest()
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return
  }
  if (args.length) throw new Error('strategy_posture_usage_invalid')
  const result = await runVerify()
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: STRATEGY_POSTURE_CONTRACT,
      error: String(error?.message || 'strategy_posture_failed').slice(0, 240),
      externalWritesPerformed: false,
    }, null, 2))
    process.exitCode = 1
  })
}

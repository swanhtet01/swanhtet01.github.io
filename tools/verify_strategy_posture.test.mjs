import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { buildStrategyPostureReport } from './verify_strategy_posture.mjs'

function readiness(overrides = {}) {
  return {
    contract: 'supermega.managed-pilot-readiness.v5',
    pilotMode: 'owner_named',
    liveProduction: {
      schemaVersion: 11,
      localTargetVersion: 13,
      versionDrift: 2,
      observedAt: '2026-08-20T17:02:04.312+06:30',
      currentStateRevalidated: false,
      browserRolesDenied: true,
      publicBrowserQuarantine: false,
      managedWritesEnabled: false,
      productionMutationAuthorized: false,
      ...(overrides.liveProduction || {}),
    },
    securityAudit: { liveSchemaVersion: 11, asOf: '2026-08-20T17:02:04.312+06:30', ...(overrides.securityAudit || {}) },
    localDatabase: { contract: 'supermega.hq.database-rehearsal.v3', schemaVersion: 13, hostedEvidenceCurrent: false },
    overall: { status: 'blocked', hostedActivationReady: false, blockingGateCount: 6,
      blockingGateIds: ['preview_rehearsal', 'managed_persistence', 'storage_privacy', 'security', 'pilot_evidence', 'production_activation'] },
    pilotEvidence: {
      productId: 'shop',
      requiredAcceptedConsecutiveRuns: 20,
      requiredPilotDayIndexes: [1, 2, 3, 4, 5],
      acceptedConsecutivePilotDayIndexes: [],
      pilotSequenceCoverageMet: false,
      requiredPilotCalendarDates: 5,
      acceptedConsecutiveObservedDateCount: 0,
      acceptedConsecutiveObservedDates: [],
      pilotCalendarCoverageMet: false,
      syntheticEvidenceAccepted: false,
      publicIdentityAllowed: false,
      ...(overrides.pilotEvidence || {}),
    },
    ...overrides,
  }
}

const aiNative = [
  '### 3.2 Owner-named Shop pilot before self-serve onboarding',
  'historical hosted schema v11; current hosted state not revalidated',
  'local schema v13; hosted parity is unproven',
  'Self-serve remains a later product expansion, not the active activation route',
  '20 consecutive accepted receipt-and-anchor-bound runs covering pilot days 1 through 5 and at least 5 distinct observed calendar dates',
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
  '20 consecutive accepted observed runs covering pilot days 1 through 5 and at least 5 distinct observed calendar dates',
  'GitHub `main` protection is verified. The current first external gate is the exact review-branch push',
  'Plant, Website, and Ecommerce keep security, dependency, regression, and handoff maintenance until Shop produces a decision packet',
  'Current 30-day AI runtime policy: local Ollama only, `llama3.2:1b`, `OLLAMA_KEEP_ALIVE=0s`, no cloud fallback',
].join('\n')

const clientReadiness = 'Freshness note, 2026-09-07\nhistorical hosted schema v11; current hosted state not revalidated\nlocal schema v13; hosted parity is unproven'

const productSupremacy = [
  'Freshness note, 2026-08-27: cloud-provider order-intake eval lanes are suspended',
  'Active AI R&D is local Ollama only: `llama3.2:1b`, `OLLAMA_KEEP_ALIVE=0s`, no cloud fallback',
].join('\n')

const orderIntakeEvalPlan = [
  'Freshness note, 2026-08-27: cloud-provider eval lanes are suspended',
  'local-ollama lane',
  '`llama3.2:1b`',
  '`OLLAMA_KEEP_ALIVE=0s`',
  'no cloud fallback',
].join('\n')

test('accepts the current owner-named strategy posture', () => {
  const report = buildStrategyPostureReport({
    readiness: readiness(),
    aiNative,
    competitiveCut,
    clientReadiness,
    productSupremacy,
    orderIntakeEvalPlan,
  })
  assert.equal(report.ok, true)
  assert.equal(report.liveSchemaVersion, 11)
  assert.deepEqual(report.productSequence, ['shop', 'plant', 'website', 'ecommerce'])
  assert.deepEqual(report.requiredPilotDayIndexes, [1, 2, 3, 4, 5])
  assert.deepEqual(report.acceptedConsecutivePilotDayIndexes, [])
  assert.equal(report.pilotSequenceCoverageMet, false)
})

test('current source documents preserve local versus historical hosted truth', async () => {
  const root = new URL('../', import.meta.url)
  const actual = JSON.parse(await readFile(new URL('hq/readiness/managed-pilot-readiness.json', root), 'utf8'))
  const input = { readiness: actual }
  for (const [key, file] of Object.entries({
    aiNative: 'AI-NATIVE-ARCHITECTURE.md', competitiveCut: 'COMPETITIVE-EXECUTION-CUT.md',
    clientReadiness: 'CLIENT-READINESS-BRIEF.md', productSupremacy: 'PRODUCT-SUPREMACY-ROADMAP.md',
    orderIntakeEvalPlan: 'AI-ORDER-INTAKE-EVAL-PLAN.md',
  })) input[key] = await readFile(new URL('hq/strategy/' + file, root), 'utf8')
  const result = buildStrategyPostureReport(input)
  assert.deepEqual(result.failures, [])
  assert.equal(result.releaseAuthorized, false)
  assert.equal(result.hostedEvidenceCurrent, false)
  assert.equal(result.localTargetVersion, 13)
  for (const mutate of [
    (r) => { r.liveProduction.versionDrift = 0 },
    (r) => { r.liveProduction.currentStateRevalidated = true },
    (r) => { r.liveProduction.publicBrowserQuarantine = true },
    (r) => { r.liveProduction.productionMutationAuthorized = true },
    (r) => { r.localDatabase.hostedEvidenceCurrent = true },
    (r) => { r.overall.hostedActivationReady = true },
    (r) => { r.overall.blockingGateIds.splice(1, 1); r.overall.blockingGateCount -= 1 },
  ]) {
    const changed = structuredClone(actual)
    mutate(changed)
    assert.equal(buildStrategyPostureReport({ ...input, readiness: changed }).ok, false)
  }
  assert.equal(buildStrategyPostureReport({ ...input, aiNative: input.aiNative + '\ncurrent v11 production parity' }).ok, false)
  assert.equal(buildStrategyPostureReport({ ...input, clientReadiness: input.clientReadiness + '\nzero drift from the local v11 target' }).ok, false)
})

test('rejects stale self-serve and stale schema strategy posture', () => {
  const report = buildStrategyPostureReport({
    readiness: readiness(),
    aiNative: `${aiNative}\nManaged onboarding is SELF-SERVE\nproduction schema v10 observed`,
    competitiveCut,
    clientReadiness: `${clientReadiness}\nProduction is at v10`,
    productSupremacy,
    orderIntakeEvalPlan,
  })
  assert.equal(report.ok, false)
  assert.ok(report.failures.includes('strategy_posture_ai_active_self_serve_claim'))
  assert.ok(report.failures.includes('strategy_posture_stale_claim:production schema v10 observed'))
  assert.ok(report.failures.includes('strategy_posture_stale_claim:Production is at v10'))
})

test('rejects stale GitHub-main-protection next-gate strategy text', () => {
  const report = buildStrategyPostureReport({
    readiness: readiness(),
    aiNative: aiNative.replace(
      'GitHub main protection verified, review-branch publication still owner-gated',
      'GitHub main protection still owner-gated',
    ),
    competitiveCut: competitiveCut.replace(
      'GitHub `main` protection is verified. The current first external gate is the exact review-branch push',
      'The current first external gate is GitHub `main` protection',
    ),
    clientReadiness,
    productSupremacy,
    orderIntakeEvalPlan,
  })
  assert.equal(report.ok, false)
  assert.ok(report.failures.includes('strategy_posture_ai_review_branch_gate_missing'))
  assert.ok(report.failures.includes('strategy_posture_ai_stale_github_gate_claim'))
  assert.ok(report.failures.includes('strategy_posture_competitive_cut_review_branch_gate_missing'))
  assert.ok(report.failures.includes('strategy_posture_competitive_cut_stale_github_gate_claim'))
})

test('rejects readiness drift from the strategy authority', () => {
  const report = buildStrategyPostureReport({
    readiness: readiness({ pilotMode: 'self_serve', liveProduction: { localTargetVersion: 12 } }),
    aiNative,
    competitiveCut,
    clientReadiness,
    productSupremacy,
    orderIntakeEvalPlan,
  })
  assert.equal(report.ok, false)
  assert.ok(report.failures.includes('strategy_posture_pilot_mode_not_owner_named'))
  assert.ok(report.failures.includes('strategy_posture_schema_drift_present'))
})

test('rejects active cloud-provider AI eval runbooks in current strategy posture', () => {
  const report = buildStrategyPostureReport({
    readiness: readiness(),
    aiNative,
    competitiveCut,
    clientReadiness,
    productSupremacy: `${productSupremacy}\nOPENAI_API_KEY`,
    orderIntakeEvalPlan: `${orderIntakeEvalPlan}\nANTHROPIC_API_KEY`,
  })
  assert.equal(report.ok, false)
  assert.ok(report.failures.includes('strategy_posture_product_supremacy_cloud_ai_runbook_active:OPENAI_API_KEY'))
  assert.ok(report.failures.includes('strategy_posture_order_intake_cloud_ai_runbook_active:ANTHROPIC_API_KEY'))
})

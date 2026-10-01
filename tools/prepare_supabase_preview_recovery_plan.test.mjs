import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  PROVIDER_READBACK_CONTRACT,
  RECOVERY_PLAN_CONTRACT,
  buildRecoveryPlan,
  contentDigest,
  selectRecoveryAction,
  validateRecoveryPlan,
  validateRecoveryPlanShape,
} from './prepare_supabase_preview_recovery_plan.mjs'

const root = resolve(import.meta.dirname, '..')
const readbackPath = resolve(root, 'hq', 'readiness', 'supabase-provider-readback-20261001.json')
const planPath = resolve(root, 'hq', 'readiness', 'supabase-preview-recovery-plan.json')
const readback = JSON.parse(await readFile(readbackPath, 'utf8'))

function sourceShape(plan) {
  return { privateMigrations: plan.migrationPlan.migrations.slice(1) }
}

test('migration content digests are stable across Windows and Linux line endings', () => {
  assert.equal(contentDigest('select 1;\nselect 2;\n'), contentDigest('select 1;\r\nselect 2;\r\n'))
  assert.equal(contentDigest(Buffer.from('select 1;\r\n')), contentDigest('select 1;\n'))
})

test('builds a read-only repair decision for the current acceptance branch', async () => {
  const plan = await buildRecoveryPlan(readback)
  assert.equal(plan.contract, RECOVERY_PLAN_CONTRACT)
  assert.equal(plan.providerReadback.contract, PROVIDER_READBACK_CONTRACT)
  assert.equal(plan.integrationBaseCommit, '0423c4fc73d9dd48cfbffa72e4ec22a615a21cf4')
  assert.equal(plan.decision.action, 'repair')
  assert.deepEqual(plan.decision.missingMigrations.map((entry) => entry.name), [
    '20260929171000_ecommerce_decision_review_fk_index.sql',
    '20260930010000_app_rls_initplan_optimization.sql',
  ])
  assert.equal(plan.execution.authorized, false)
  assert.equal(plan.execution.databaseWrites, 0)
  assert.equal(plan.execution.providerMutations, 0)
  assert.equal(plan.execution.productionChanges, 0)
  assert.equal(plan.execution.deploymentChanges, 0)
})

test('selects recreate when the branch contains rows or diverged history', async () => {
  const plan = await buildRecoveryPlan(readback)
  for (const mutate of [
    (record) => { record.acceptance.rowCounts.workspace_events = 1 },
    (record) => { record.acceptance.withData = true },
    (record) => { record.acceptance.schemaVersion = 12 },
    (record) => { record.acceptance.appliedMigrationNames[4] = 'unexpected_migration' },
  ]) {
    const altered = structuredClone(readback)
    mutate(altered)
    const decision = selectRecoveryAction(altered, sourceShape(plan))
    assert.equal(decision.action, 'recreate')
    assert.equal(decision.missingMigrations.length, 0)
  }
})

test('selects retire when the retained preview target is not healthy', async () => {
  const plan = await buildRecoveryPlan(readback)
  const altered = structuredClone(readback)
  altered.acceptance.previewProjectStatus = 'INACTIVE'
  const decision = selectRecoveryAction(altered, sourceShape(plan))
  assert.equal(decision.action, 'retire')
  assert.deepEqual(decision.reasonCodes, ['preview_target_not_healthy'])
})

test('rejects write authority, credentials, altered migration scope, and stale packets', async () => {
  const plan = await buildRecoveryPlan(readback)
  for (const mutate of [
    (record) => { record.execution.authorized = true },
    (record) => { record.execution.databaseWrites = 1 },
    (record) => { record.execution.credentialValuesIncluded = true },
    (record) => { record.decision.missingMigrations.pop() },
    (record) => { record.stalePacket.executable = true },
  ]) {
    const altered = structuredClone(plan)
    mutate(altered)
    assert.throws(
      () => validateRecoveryPlanShape(altered),
      /supabase_preview_recovery_plan_(execution_boundary|decision|stale_packet)/,
    )
  }
  assert.throws(
    () => validateRecoveryPlanShape({ contract: 'supermega.supabase-preview-rehearsal-proposal.v1' }),
    /supabase_preview_recovery_plan_contract/,
  )
})

test('the generated plan verifies byte-for-byte against current source and readback', async () => {
  const plan = JSON.parse(await readFile(planPath, 'utf8'))
  const validated = await validateRecoveryPlan(plan)
  assert.equal(validated.decision.action, 'repair')
  assert.equal(validated.execution.authorized, false)
})

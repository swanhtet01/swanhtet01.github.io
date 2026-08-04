import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import {
  RELEASE_INTEGRATION_PLAN_CONTRACT,
  buildReleaseIntegrationPlan,
  classifyIntegrationConflict,
  parseMergeTreeNameOnly,
  validateReleaseIntegrationPlan,
  writeExclusiveJson,
} from './prepare_release_integration_plan.mjs'

const sha = (value) => value.repeat(40)
const conflicts = [
  'docs/supermega-enterprise-activation.md',
  'hq/WORKBOARD.md',
  'package.json',
  'showroom/src/core/ClientDataOnboarding.tsx',
  'showroom/src/core/CoreApp.tsx',
  'showroom/src/core/CoreShell.tsx',
  'showroom/src/core/ProductHomeReadiness.tsx',
  'showroom/src/core/SettingsPage.tsx',
  'showroom/src/core/core-app.css',
  'showroom/src/core/managed-trial.ts',
  'showroom/src/products/ecommerce/EcommerceBuyingWorkspace.tsx',
  'showroom/src/products/ecommerce/EcommerceProduct.tsx',
  'supermega_runtime/trial_runtime.py',
  'tests/test_cloud_runtime.py',
  'tests/test_database_activation_contract.py',
  'tools/verify_app_build.mjs',
  'tools/verify_app_release_live.mjs',
  'tools/verify_app_security_contract.mjs',
  'tools/verify_hq_contract.mjs',
]

function valid(overrides = {}) {
  return {
    generatedAt: '2026-07-30T14:30:00.000Z',
    repository: 'swanhtet01/swanhtet01.github.io',
    origin: 'https://github.com/swanhtet01/swanhtet01.github.io.git',
    candidate: { branch: 'agent/integrated-client-demo-foundation', commit: sha('a'), clean: true },
    main: { commit: sha('b') },
    relations: { mergeBase: sha('c'), mainOnlyCommits: 54, candidateOnlyCommits: 273 },
    mergeTree: { tree: sha('d'), status: 'conflicts', conflicts },
    ...overrides,
  }
}

test('merge-tree parser is exact, sorted, and duplicate safe', () => {
  assert.deepEqual(parseMergeTreeNameOnly(`${sha('d')}\r\nb/two.ts\r\na/one.ts\r\nb/two.ts\r\n`), {
    tree: sha('d'),
    paths: ['a/one.ts', 'b/two.ts'],
  })
  assert.throws(() => parseMergeTreeNameOnly(`${sha('d')}\n../escape.ts\n`), /release_integration_conflict_path_invalid/)
})

test('conflicts route to bounded accountable batches', () => {
  assert.equal(classifyIntegrationConflict('showroom/src/core/managed-trial.ts'), 'identity-data-onboarding')
  assert.equal(classifyIntegrationConflict('showroom/src/core/CoreApp.tsx'), 'app-shell')
  assert.equal(classifyIntegrationConflict('showroom/src/products/ecommerce/EcommerceProduct.tsx'), 'ecommerce')
  assert.equal(classifyIntegrationConflict('tools/verify_app_security_contract.mjs'), 'release-security-hq')
  assert.equal(classifyIntegrationConflict('tools/create_public_vercel_output.mjs'), 'release-security-hq')
  assert.equal(classifyIntegrationConflict('kernel/managed-pilot-readiness.mjs'), 'release-security-hq')
  assert.equal(classifyIntegrationConflict('unknown/new-contract.ts'), 'cross-cutting')
})

test('integration plan covers every conflict once and grants no authority', () => {
  const plan = buildReleaseIntegrationPlan(valid())
  assert.equal(plan.contract, RELEASE_INTEGRATION_PLAN_CONTRACT)
  assert.equal(plan.mergeTree.conflictCount, 19)
  assert.deepEqual(plan.integration.batches.map((batch) => [batch.id, batch.files.length]), [
    ['identity-data-onboarding', 6],
    ['app-shell', 4],
    ['ecommerce', 2],
    ['release-security-hq', 7],
  ])
  assert.equal(plan.integration.status, 'manual_integration_required')
  assert.equal(plan.authority.mergeApproved, false)
  assert.equal(plan.authority.pushApproved, false)
  assert.equal(plan.authority.deploymentApproved, false)
  assert.equal(validateReleaseIntegrationPlan(plan).digest, plan.digest)
})

test('tampering, weak divergence, and status drift fail closed', () => {
  assert.throws(() => buildReleaseIntegrationPlan(valid({ candidate: { ...valid().candidate, clean: false } })), /release_integration_worktree_dirty/)
  assert.throws(() => buildReleaseIntegrationPlan(valid({ relations: { ...valid().relations, mainOnlyCommits: 0 } })), /release_integration_not_diverged/)
  assert.throws(() => buildReleaseIntegrationPlan(valid({ mergeTree: { ...valid().mergeTree, status: 'clean' } })), /release_integration_merge_status_invalid/)
  const forged = buildReleaseIntegrationPlan(valid())
  forged.authority.mergeApproved = true
  assert.throws(() => validateReleaseIntegrationPlan(forged), /release_integration_packet_invalid/)
})

test('clean merge analysis remains review-only', () => {
  const plan = buildReleaseIntegrationPlan(valid({ mergeTree: { tree: sha('d'), status: 'clean', conflicts: [] } }))
  assert.equal(plan.integration.status, 'clean_merge_review_required')
  assert.equal(plan.integration.batchCount, 0)
  assert.equal(plan.nextAction.firstBatch, null)
  assert.equal(plan.authority.mergeApproved, false)
})

test('plan output is exclusive and non-overwriting', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-integration-plan-'))
  const output = join(directory, 'plan.json')
  try {
    const plan = buildReleaseIntegrationPlan(valid())
    const receipt = await writeExclusiveJson(output, plan)
    assert.equal(receipt.bytes > 0, true)
    assert.equal(JSON.parse(await readFile(output, 'utf8')).digest, plan.digest)
    await assert.rejects(() => writeExclusiveJson(output, plan), /release_integration_output_exists/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

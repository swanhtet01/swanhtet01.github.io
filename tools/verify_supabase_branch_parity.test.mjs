import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BRANCH_PARITY_CONTRACT,
  computeExpectedSurfaceDigest,
  verifyBranchParity,
  verifyEvidence,
} from './verify_supabase_branch_parity.mjs'

const evidencePath = resolve(
  import.meta.dirname,
  '..',
  'hq',
  'readiness',
  'supabase-branch-parity.json',
)

// Deriving the digest replays every reviewed migration through PGlite, so it is
// computed once here and shared by every tampered-evidence case below.
const expectedDigest = await computeExpectedSurfaceDigest()
const recordedEvidence = JSON.parse(await readFile(evidencePath, 'utf8'))

function tamperedEvidence(mutate) {
  const evidence = structuredClone(recordedEvidence)
  mutate(evidence)
  return evidence
}

test('the recorded branch evidence verifies against the reviewed migrations', async () => {
  const summary = await verifyBranchParity()
  assert.equal(summary.ok, true)
  assert.equal(summary.contract, BRANCH_PARITY_CONTRACT)
  assert.equal(summary.branch, recordedEvidence.branch.name)
  assert.equal(summary.projectRef, recordedEvidence.branch.projectRef)
  assert.equal(summary.surface, expectedDigest.surface)
  assert.equal(summary.checks, 36)
})

test('a tampered surface digest breaks parity', () => {
  const evidence = tamperedEvidence((record) => {
    record.observed.surface = 'f'.repeat(64)
  })
  assert.throws(() => verifyEvidence(evidence, expectedDigest), /surface digest parity/)
})

test('a tampered section digest breaks parity', () => {
  const evidence = tamperedEvidence((record) => {
    record.observed.sections.policies = '0'.repeat(64)
  })
  assert.throws(() => verifyEvidence(evidence, expectedDigest), /section parity policies/)
})

test('a browser-facing role holding schema usage fails isolation', () => {
  const evidence = tamperedEvidence((record) => {
    record.isolation.rolesWithSchemaUsage.push('anon')
  })
  assert.throws(
    () => verifyEvidence(evidence, expectedDigest),
    /no browser-facing role holds schema usage/,
  )
})

test('tenant rows on the isolated branch fail isolation', () => {
  const evidence = tamperedEvidence((record) => {
    record.isolation.tableRowCounts.workspace_state = 1
  })
  assert.throws(
    () => verifyEvidence(evidence, expectedDigest),
    /isolated branch carries no tenant data/,
  )
})

test('a graphql-exposed public relation fails isolation', () => {
  const evidence = tamperedEvidence((record) => {
    record.isolation.graphqlPublicRelations = 1
  })
  assert.throws(
    () => verifyEvidence(evidence, expectedDigest),
    /graphql exposes no public relation/,
  )
})

test('a public table without row level security fails the public surface', () => {
  const evidence = tamperedEvidence((record) => {
    record.publicSurface.tablesWithoutRowLevelSecurity = 1
  })
  assert.throws(
    () => verifyEvidence(evidence, expectedDigest),
    /row level security covers every public table/,
  )
})

test('a browser-reachable public table fails the public surface', () => {
  const evidence = tamperedEvidence((record) => {
    record.publicSurface.tablesReachableByBrowserRole = 1
  })
  assert.throws(
    () => verifyEvidence(evidence, expectedDigest),
    /no public table is reachable by a browser role/,
  )
})

test('a named browser-reachable table fails even when the count claims zero', () => {
  const evidence = tamperedEvidence((record) => {
    record.publicSurface.browserReachableTableNames.push('enterprise_customers')
  })
  assert.throws(
    () => verifyEvidence(evidence, expectedDigest),
    /browser-reachable public table roster is empty/,
  )
})

test('an error-level security advisor finding fails the gate', () => {
  const evidence = tamperedEvidence((record) => {
    record.securityAdvisor.errorCount = 1
  })
  assert.throws(
    () => verifyEvidence(evidence, expectedDigest),
    /security advisor reports no errors/,
  )
})

test('a warn-level security advisor finding fails the gate', () => {
  const evidence = tamperedEvidence((record) => {
    record.securityAdvisor.warnCount = 1
  })
  assert.throws(
    () => verifyEvidence(evidence, expectedDigest),
    /security advisor reports no warnings/,
  )
})

test('an unexpected info lint fails the gate', () => {
  const evidence = tamperedEvidence((record) => {
    record.securityAdvisor.infoLintNames.push('exposed_auth_users')
  })
  assert.throws(
    () => verifyEvidence(evidence, expectedDigest),
    /security advisor info lints are only the default-deny notice/,
  )
})

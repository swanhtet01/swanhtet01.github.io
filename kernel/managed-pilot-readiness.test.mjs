import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import {
  buildManagedPilotReadiness,
  readinessDigest,
  validateManagedPilotReadiness,
} from './managed-pilot-readiness.mjs'

const root = resolve(dirname(process.argv[1]), '..')
const sourceFiles = [
  'hq/portfolio.json',
  'hq/research/postgres17-rehearsal.json',
  'hq/pilots/private-storage-privacy-audit.md',
  'hq/readiness/supabase-security-advisor-audit.json',
  'hq/NOW.md',
  'package.json',
  'kernel/managed-pilot-readiness.mjs',
]

async function loadBaseInput() {
  const contents = new Map()
  await Promise.all(sourceFiles.map(async (path) => {
    contents.set(path, await readFile(resolve(root, path), 'utf8'))
  }))

  return {
    portfolio: JSON.parse(contents.get('hq/portfolio.json')),
    databaseEvidence: JSON.parse(contents.get('hq/research/postgres17-rehearsal.json')),
    storageAudit: contents.get('hq/pilots/private-storage-privacy-audit.md'),
    securityAudit: JSON.parse(contents.get('hq/readiness/supabase-security-advisor-audit.json')),
    hqNow: contents.get('hq/NOW.md'),
    packageManifest: JSON.parse(contents.get('package.json')),
    sourceReceipts: sourceFiles.map((path) => ({
      path,
      digest: readinessDigest(contents.get(path)),
    })),
  }
}

let baseInput

test.before(async () => {
  baseInput = await loadBaseInput()
})

test('builds a blocked owner-gated ledger from bounded evidence', () => {
  const ledger = buildManagedPilotReadiness(baseInput)
  assert.equal(ledger.contract, 'supermega.managed-pilot-readiness.v5')
  assert.equal(ledger.pilotMode, 'owner_named')
  assert.equal(ledger.overall.status, 'blocked')
  assert.equal(ledger.overall.blockingGateCount, 6)
  assert.equal(ledger.gates.length, 8)
  assert.equal(ledger.gates[0].id, 'local_database_rehearsal')
  assert.equal(ledger.gates[0].status, 'ready-local')
  assert.equal(ledger.gates[1].id, 'production_source_parity')
  assert.equal(ledger.gates[1].status, 'ready-metadata')
  assert.equal(ledger.controls.ownerApprovalRequired, true)
  assert.equal(ledger.founderDecision.status, 'required')
  assert.equal(ledger.founderDecision.authority, 'proposal_only')
  assert.equal(ledger.founderDecision.proposedActions.includes('delete_failed_preview_branch'), true)
  assert.equal(ledger.founderDecision.doesNotAuthorize.includes('production_database_change'), true)
  assert.equal(ledger.securityAudit.productionMutationAuthorized, false)
  assert.equal(ledger.securityAudit.findingCount, 27)
  assert.equal(ledger.products.map((product) => product.productId).join(','), 'shop,plant,website,ecommerce')
  assert.equal(ledger.sourceReceipts.length, sourceFiles.length)
  assert.equal(ledger.sourceReceipts.every((entry) => entry.path && /^sha256:[0-9a-f]{64}$/.test(entry.digest)), true)
  assert.equal(validateManagedPilotReadiness(ledger), ledger)
})

test('uses latest evidence timestamp asOf', () => {
  const ledger = buildManagedPilotReadiness(baseInput)
  const expectedAsOf = [String(baseInput.databaseEvidence.recordedAt || ''), String(baseInput.securityAudit.asOf || '')]
    .sort()
    .at(-1)
  assert.equal(ledger.asOf, expectedAsOf)
})

test('rejects missing mandatory gate blockers and permission changes', () => {
  const hosted = structuredClone(baseInput)
  hosted.hqNow = hosted.hqNow.replace(
    'Live managed persistence ready: `false`',
    'Live managed persistence ready: `true`',
  )
  assert.throws(() => buildManagedPilotReadiness(hosted), /managed_pilot_readiness_live_boundary_invalid/)

  const mutated = structuredClone(baseInput)
  mutated.securityAudit.controls.databaseWrites = 1
  assert.throws(() => validateManagedPilotReadiness(buildManagedPilotReadiness(mutated)), /managed_pilot_readiness_security_audit_invalid/)
})

test('rejects source receipt tampering', () => {
  const tampered = buildManagedPilotReadiness(baseInput)
  tampered.sourceReceipts = tampered.sourceReceipts.slice(0, -1)
  assert.throws(() => validateManagedPilotReadiness(tampered), /managed_pilot_readiness_sources_invalid/)

  const reordered = buildManagedPilotReadiness(baseInput)
  reordered.sourceReceipts = [...reordered.sourceReceipts.slice(1), reordered.sourceReceipts[0]]
  assert.throws(() => validateManagedPilotReadiness(reordered), /managed_pilot_readiness_digest_invalid/)
})

test('normalizes line endings for stable digests', () => {
  assert.equal(readinessDigest('line one\r\nline two\r\n'), readinessDigest('line one\nline two\n'))
})

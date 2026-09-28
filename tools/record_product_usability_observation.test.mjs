import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { buildObservation, CONTRACT, recordObservation } from './record_product_usability_observation.mjs'

const HEAD = 'a'.repeat(40)
const BASE = 'b'.repeat(40)
const fixture = () => ({
  contract: CONTRACT,
  experimentId: 'SETUP-01',
  candidateCommit: HEAD,
  comparisonCommit: BASE,
  variant: 'candidate',
  sessionCode: 'SESSION-A1B2C3D4',
  consentAttested: true,
  observerRole: 'owner_moderator',
  observedAt: '2026-09-18T01:02:03.000Z',
  language: 'my',
  deviceClass: 'mobile',
  taskOutcome: 'completed_unassisted',
  activeSeconds: 143,
  helpRequests: 0,
  moderatorInterventions: 0,
  issueCodes: [],
  boundaryChecks: { scopeUnderstood: true, nextActionUnderstood: true, externalEffectBoundaryUnderstood: true },
  safety: { dataLoss: false, crossTenantExposure: false, wrongMoneyResult: false, falseExternalEffectStatus: false },
})

test('records a privacy-minimal formative observation without claiming a winner', () => {
  const receipt = buildObservation(fixture(), { expectedHead: HEAD })
  assert.equal(receipt.derived.completedUnassisted, true)
  assert.equal(receipt.derived.allBoundariesUnderstood, true)
  assert.equal(receipt.authority.quantitativeWinnerProven, false)
  assert.equal(receipt.authority.releaseAuthorized, false)
  assert.equal(receipt.privacy.participantIdentityRetained, false)
  assert.match(receipt.sessionDigest, /^sha256:[0-9a-f]{64}$/)
  assert.match(receipt.digest, /^sha256:[0-9a-f]{64}$/)
  assert.doesNotMatch(JSON.stringify(receipt), /SESSION-A1B2C3D4/)
})

test('safety findings stop the task and remain eligible only when outcome agrees', () => {
  const input = fixture()
  input.taskOutcome = 'stopped_for_safety'
  input.safety.wrongMoneyResult = true
  const receipt = buildObservation(input, { expectedHead: HEAD })
  assert.equal(receipt.derived.safetyStop, true)
  assert.equal(receipt.derived.eligibleForFormativeAnalysis, false)
  input.taskOutcome = 'not_completed'
  assert.throws(() => buildObservation(input, { expectedHead: HEAD }), /safety_outcome_mismatch/)
})

test('rejects invented identity, free text, malformed classifications and false consent', () => {
  for (const mutate of [
    value => { value.name = 'Private person' },
    value => { value.sessionCode = '09123456789' },
    value => { value.issueCodes = ['Looks confusing to me'] },
    value => { value.consentAttested = false },
    value => { value.observerRole = 'ai_agent' },
    value => { value.candidateCommit = value.comparisonCommit },
    value => { value.boundaryChecks.scopeUnderstood = 'yes' },
    value => { value.activeSeconds = 7201 },
  ]) {
    const input = fixture(); mutate(input)
    assert.throws(() => buildObservation(input, { expectedHead: HEAD }), /usability_observation_/)
  }
})

test('writes once and binds the clean exact checkout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'supermega-usability-'))
  const repo = join(root, 'repo')
  const inputPath = join(root, 'input.json')
  const outputPath = join(root, 'receipt.json')
  try {
    await mkdir(repo)
    execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.name', 'SuperMega Test'], { cwd: repo })
    execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repo })
    await writeFile(join(repo, 'marker.txt'), 'comparison\n')
    execFileSync('git', ['add', 'marker.txt'], { cwd: repo })
    execFileSync('git', ['commit', '-m', 'comparison'], { cwd: repo, stdio: 'ignore' })
    const comparisonCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
    await writeFile(join(repo, 'marker.txt'), 'candidate\n')
    execFileSync('git', ['add', 'marker.txt'], { cwd: repo })
    execFileSync('git', ['commit', '-m', 'candidate'], { cwd: repo, stdio: 'ignore' })
    const candidateCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
    await writeFile(inputPath, JSON.stringify({ ...fixture(), candidateCommit, comparisonCommit }))
    const receipt = await recordObservation({ inputPath, outputPath, expectedHead: candidateCommit, cwd: repo })
    assert.equal(JSON.parse(await readFile(outputPath, 'utf8')).digest, receipt.digest)
    await assert.rejects(
      () => recordObservation({ inputPath, outputPath, expectedHead: candidateCommit, cwd: repo }),
      /EEXIST/,
    )
    await writeFile(join(repo, 'marker.txt'), 'dirty\n')
    await assert.rejects(
      () => recordObservation({ inputPath, outputPath: join(root, 'dirty.json'), expectedHead: candidateCommit, cwd: repo }),
      /source_state_invalid/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('recordObservation source contains exact git and exclusive-output guards', async () => {
  const source = await readFile(new URL('./record_product_usability_observation.mjs', import.meta.url), 'utf8')
  for (const token of ["['status', '--porcelain']", "['merge-base', '--is-ancestor'", "open(output, 'wx')", 'manualAttestationNotCryptographic: true']) {
    assert.ok(source.includes(token), token)
  }
  assert.equal(typeof recordObservation, 'function')
})

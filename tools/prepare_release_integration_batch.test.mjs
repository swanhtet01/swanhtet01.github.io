import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import {
  IDENTITY_DATA_REQUIREMENTS,
  RELEASE_INTEGRATION_BATCH_CONTRACT,
  assessIdentityDataSources,
  buildIdentityDataComparison,
  validateIdentityDataComparison,
  writeExclusiveJson,
} from './prepare_release_integration_batch.mjs'

const sha = (value) => value.repeat(40)
const files = [...new Set(IDENTITY_DATA_REQUIREMENTS.map((entry) => entry.file))].sort()

function sources(authorities = ['upstream', 'candidate']) {
  return Object.fromEntries(files.map((file) => [file, IDENTITY_DATA_REQUIREMENTS
    .filter((entry) => entry.file === file && authorities.includes(entry.authority))
    .flatMap((entry) => entry.tokens).join('\n') || '// retained source']))
}

function tree(ref, commit, authorities) {
  return { ref, commit, sources: sources(authorities), blobs: Object.fromEntries(files.map((file, index) => [file, String((index % 8) + 1).repeat(40)])) }
}

function comparison() {
  return buildIdentityDataComparison({
    generatedAt: '2026-07-30T15:00:00.000Z',
    upstream: tree('origin/main', sha('a'), ['upstream']),
    candidate: tree('HEAD', sha('b'), ['candidate']),
  })
}

test('neither current side can satisfy the required union alone', () => {
  const upstream = assessIdentityDataSources(sources(['upstream']))
  const candidate = assessIdentityDataSources(sources(['candidate']))
  assert.equal(upstream.ok, false)
  assert.equal(upstream.authority.upstream.passed, true)
  assert.equal(upstream.authority.candidate.passed, false)
  assert.equal(candidate.ok, false)
  assert.equal(candidate.authority.upstream.passed, false)
  assert.equal(candidate.authority.candidate.passed, true)
})

test('one composed tree must retain both authorities', () => {
  const integrated = assessIdentityDataSources(sources())
  assert.equal(integrated.ok, true)
  assert.equal(integrated.authority.upstream.passed, true)
  assert.equal(integrated.authority.candidate.passed, true)
  const missing = sources()
  missing['showroom/src/core/managed-trial.ts'] = missing['showroom/src/core/managed-trial.ts'].replace('requestManagedPasswordRecovery', '')
  assert.equal(assessIdentityDataSources(missing).ok, false)
})

test('unrelated YTF source is rejected from the SuperMega batch', () => {
  const contaminated = sources()
  contaminated['supermega_runtime/trial_runtime.py'] += '\n# Yangon Tyre'
  const assessment = assessIdentityDataSources(contaminated)
  assert.equal(assessment.ok, false)
  assert.deepEqual(assessment.forbiddenSourceFiles, ['supermega_runtime/trial_runtime.py'])
})

test('comparison is exact, digest-bound, and grants no mutation authority', () => {
  const packet = comparison()
  assert.equal(packet.contract, RELEASE_INTEGRATION_BATCH_CONTRACT)
  assert.equal(packet.decision.status, 'manual_union_required')
  assert.equal(packet.upstream.authority.upstream.passed, true)
  assert.equal(packet.candidate.authority.candidate.passed, true)
  assert.equal(packet.authority.sourceFilesModified, false)
  assert.equal(packet.authority.mergeApproved, false)
  assert.equal(validateIdentityDataComparison(packet).digest, packet.digest)
  packet.authority.mergeApproved = true
  assert.throws(() => validateIdentityDataComparison(packet), /release_integration_batch_packet_invalid/)
})

test('malformed sources and duplicate refs fail closed', () => {
  const invalidSources = sources()
  delete invalidSources[files[0]]
  assert.throws(() => assessIdentityDataSources(invalidSources), /release_integration_batch_sources_invalid/)
  assert.throws(() => buildIdentityDataComparison({
    generatedAt: '2026-07-30T15:00:00.000Z',
    upstream: tree('origin/main', sha('a'), ['upstream']),
    candidate: tree('HEAD', sha('a'), ['candidate']),
  }), /release_integration_batch_refs_not_distinct/)
})

test('comparison output is exclusive and non-overwriting', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-integration-batch-'))
  const output = join(directory, 'batch.json')
  try {
    const packet = comparison()
    const receipt = await writeExclusiveJson(output, packet)
    assert.equal(receipt.bytes > 0, true)
    assert.equal(JSON.parse(await readFile(output, 'utf8')).digest, packet.digest)
    await assert.rejects(() => writeExclusiveJson(output, packet), /release_integration_batch_output_exists/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  APP_ENTRY_RENDERED_CONTRACT,
  assertEvidenceDirectoryReady,
  assertExpectedHead,
  assertRenderedProofProvenanceStable,
  buildEvidenceDescriptor,
  buildGitSourceState,
  buildScreenshotEvidence,
  collectDirectoryManifest,
  sha256Digest,
  signedRenderedProof,
} from './rendered_proof_provenance.mjs'

const commit = 'a'.repeat(40)
const tree = 'b'.repeat(40)

test('clean source state is exact and dirty source fails closed', () => {
  assert.deepEqual(buildGitSourceState({ commit, tree, status: '' }), { commit, tree, clean: true })
  assert.throws(() => buildGitSourceState({ commit, tree, status: ' M tools/file.mjs' }), /app_entry_rendered_source_tree_dirty/)
  assert.throws(() => buildGitSourceState({ commit: 'short', tree, status: '' }), /app_entry_rendered_git_state_invalid/)
})

test('artifact manifest is deterministic and changes with bytes', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-rendered-proof-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(join(directory, 'assets'))
  await writeFile(join(directory, 'index.html'), '<main>Shop</main>')
  await writeFile(join(directory, 'assets', 'app.js'), 'console.log("ok")')
  const first = await collectDirectoryManifest(directory)
  const second = await collectDirectoryManifest(directory)
  assert.equal(first.digest, second.digest)
  assert.equal(first.fileCount, 2)
  assert.deepEqual(first.entries.map((entry) => entry.path), ['assets/app.js', 'index.html'])
  await writeFile(join(directory, 'assets', 'app.js'), 'console.log("changed")')
  const changed = await collectDirectoryManifest(directory)
  assert.notEqual(first.digest, changed.digest)
})

test('expected commit and stable provenance are mandatory', () => {
  const proof = {
    source: { commit, tree, clean: true },
    verifier: { path: 'tools/verify.mjs', digest: sha256Digest('verifier'), bytes: 8 },
    artifact: { path: 'showroom/dist', digest: sha256Digest('dist'), fileCount: 2, totalBytes: 10 },
  }
  assert.equal(assertExpectedHead(proof, commit), commit)
  assert.throws(() => assertExpectedHead(proof, 'c'.repeat(40)), /app_entry_rendered_expected_head_mismatch/)
  assert.equal(assertRenderedProofProvenanceStable(proof, structuredClone(proof)), true)
  const changed = structuredClone(proof)
  changed.artifact.digest = sha256Digest('changed')
  assert.throws(() => assertRenderedProofProvenanceStable(proof, changed), /app_entry_rendered_artifact_changed_during_proof/)
})

test('screenshots and report stay inside one fresh declared evidence directory', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-rendered-evidence-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const screenshotPath = join(directory, 'mobile.png')
  const reportPath = join(directory, 'report.json')
  const payload = Buffer.from('png-bytes')
  assert.deepEqual(buildScreenshotEvidence({ payload, path: screenshotPath, evidenceDir: directory }), {
    file: 'mobile.png',
    bytes: payload.byteLength,
    digest: sha256Digest(payload),
  })
  assert.deepEqual(buildEvidenceDescriptor({ evidenceDir: directory, outputPath: reportPath }), {
    directory: '.',
    report: 'report.json',
  })
  assert.throws(
    () => buildScreenshotEvidence({ payload, path: join(directory, '..', 'outside.png'), evidenceDir: directory }),
    /app_entry_rendered_screenshot_outside_evidence_directory/,
  )
  assert.equal(await assertEvidenceDirectoryReady(directory), true)
  await writeFile(join(directory, 'stale.txt'), 'stale')
  await assert.rejects(() => assertEvidenceDirectoryReady(directory), /app_entry_rendered_evidence_directory_not_empty/)
})

test('report digest signs the exact body', () => {
  const report = signedRenderedProof({ ok: true, contract: APP_ENTRY_RENDERED_CONTRACT, checks: 2 })
  assert.equal(report.digest, sha256Digest(JSON.stringify({ ok: true, contract: APP_ENTRY_RENDERED_CONTRACT, checks: 2 })))
})

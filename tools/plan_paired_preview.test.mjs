import test from 'node:test'
import assert from 'node:assert/strict'
import { digest, planPairedPreview } from './plan_paired_preview.mjs'

const commit = 'a'.repeat(40), tree = 'b'.repeat(40)
const body = () => ({ contract: 'supermega.paired-preview-source-preparation.v1', state: 'local_sources_prepared',
  localMutationOutcome: 'confirmed_complete', commit, tree,
  sources: ['app', 'public'].map(kind => ({ kind, path: `/synthetic/${kind}`, commit, tree, clean: true })) })
const encode = value => Buffer.from(JSON.stringify({ ...value, digest: digest(JSON.stringify(value)) }))
const input = () => ({ preparationBytes: encode(body()), expectedCommit: commit, expectedTree: tree,
  tooling: { commit, tree, clean: true, moduleDigest: digest('synthetic') }, now: new Date('2026-09-21T00:00:00Z') })
const inspect = root => ({ root, commit, tree, clean: true })
test('fresh source inspection yields a deterministic blocked readiness plan, not authority', () => {
  const result = planPairedPreview(input(), inspect)
  assert.deepEqual(result, planPairedPreview(input(), inspect))
  assert.equal(result.expiresAt, '2026-09-21T00:10:00.000Z')
  assert.equal(result.blockers.length, 6)
  assert.ok(Object.values(result.controls).every(value => value === false))
  const { digest: hash, ...rest } = result
  assert.equal(hash, digest(JSON.stringify(rest)))
})
for (const field of ['commit', 'tree', 'clean']) test(`changed source ${field} fails closed`, () => {
  assert.throws(() => planPairedPreview(input(), root => ({ ...inspect(root), [field]: field === 'clean' ? false : 'c'.repeat(40) })), /source_changed/)
})
for (const change of [value => {value.sources.pop()}, value => {value.sources[1].kind = 'app'},
  value => {value.commit = 'c'.repeat(40)}, value => {value.state = 'preparing'},
  value => {value.sources[0].clean = false}]) test('rehashed invalid receipt is rejected', () => {
  const value = body(); change(value)
  assert.throws(() => planPairedPreview({...input(), preparationBytes: encode(value)}, inspect), /paired_preview_plan_/)
})
test('same real source root cannot impersonate two worktrees', () => {
  assert.throws(() => planPairedPreview(input(), () => inspect('/same')), /sources_not_distinct/)
})
test('tampering without rehash is rejected', () => {
  const args = input(); args.preparationBytes = args.preparationBytes.toString().replace('local_sources_prepared', 'tampered')
  assert.throws(() => planPairedPreview(args, inspect), /receipt_digest_mismatch/)
})
test('untrusted provider claims cannot clear blockers or leak through output', () => {
  const value = body(); value.provider = { ready: true, token: 'SYNTHETIC-PRIVATE-SENTINEL' }
  const plan = planPairedPreview({...input(), preparationBytes: encode(value)}, inspect)
  assert.ok(plan.blockers.includes('provider_target_and_protection_unverified'))
  assert.ok(!JSON.stringify(plan).includes('SYNTHETIC-PRIVATE-SENTINEL'))
})
test('dirty tooling is rejected', () => {
  const args = input(); args.tooling.clean = false
  assert.throws(() => planPairedPreview(args, inspect), /tooling_invalid/)
})

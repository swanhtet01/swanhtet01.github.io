import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../showroom/src/products/website/PublishWorkspace.tsx', import.meta.url), 'utf8')
const expression = source.match(/const approvalKey = (.+)/)?.[1]
const baseline = { fingerprint: 'revision-digest', workspace: { contentRevision: 3, evidence: [{ id: 'review-a' }] }, managedActorId: '', reviewer: 'Reviewer', approvalNote: 'Checked this revision' }
const key = context => vm.runInNewContext(expression, context)

test('confirmation binds actual revision, actor, decision and evidence expression', () => {
  assert.ok(expression)
  const original = key(baseline)
  assert.equal(key(structuredClone(baseline)), original)
  for (const patch of [
    { fingerprint: 'different-digest' },
    { workspace: { ...baseline.workspace, contentRevision: 4 } },
    { workspace: { ...baseline.workspace, evidence: [{ id: 'review-b' }] } },
    { reviewer: 'Another reviewer' },
    { managedActorId: 'authenticated-actor' },
    { approvalNote: 'Changed decision' },
  ]) assert.notEqual(key({ ...baseline, ...patch }), original)
  assert.match(source, /const approvalConfirmed = confirmedApprovalKey === approvalKey/)
  assert.match(source, /if \(!allChecksPass \|\| !approvalConfirmed\) return/)
  assert.match(source, /setConfirmedApprovalKey\(event.target.checked \? approvalKey : ''\)/)
  assert.match(source, /setConfirmedApprovalKey\(''\)/)
})

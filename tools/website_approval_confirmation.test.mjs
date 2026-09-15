import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../showroom/src/products/website/PublishWorkspace.tsx', import.meta.url), 'utf8')
const expression = source.match(/const approvalKey = (.+)/)?.[1]
const baseline = { fingerprint: 'revision-digest', workspace: { contentRevision: 3, evidence: [{ id: 'review-a' }] }, managedActorId: '', reviewer: 'Reviewer', approvalNote: 'Checked this revision' }
const key = context => vm.runInNewContext(expression, context)

test('all save handlers unlock after rejection and suppress concurrent duplicate dispatch', async () => {
  for (const [name, callback, nextName] of [['submitEvidence', 'onAddEvidence', 'submitApproval'], ['submitApproval', 'onApprove', 'recordSnapshot'], ['recordSnapshot', 'onRecordPublish', 'selectStep']]) {
    const body = source.slice(source.indexOf('  async function ' + name), source.indexOf('  ' + (nextName === 'selectStep' ? 'function ' : 'async function ') + nextName)).replace('event: FormEvent<HTMLFormElement>', 'event')
    let reject, calls = 0, issue = '', submitting = ''
    const pending = new Promise((_, fail) => { reject = fail })
    const context = {
      saveInFlight: { current: false }, setSaveIssue: value => { issue = value }, setSubmitting: value => { submitting = value },
      allChecksPass: true, approvalConfirmed: true, managedActorId: '', reviewer: 'Reviewer', approvalNote: 'Reviewed',
      evidenceKind: 'content', evidenceFinding: 'Finding', evidenceReference: 'Reference', evidenceVerifier: 'Reviewer',
      [callback]: () => { calls++; return pending },
    }
    const handler = vm.runInNewContext(body + '\n' + name, context)
    const attempt = handler({ preventDefault() {} })
    await handler({ preventDefault() {} })
    assert.equal(calls, 1)
    reject(new Error('private backend detail'))
    await attempt
    assert.equal(context.saveInFlight.current, false)
    assert.equal(submitting, '')
    assert.match(issue, /Could not confirm the save/)
    assert.doesNotMatch(issue, /private backend detail/)
  }
  assert.match(source, /saveIssue \? <p role="alert">/)
})

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

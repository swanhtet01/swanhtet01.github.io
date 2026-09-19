import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('showroom/src/core/WorkspaceControlsPage.tsx', 'utf8')
const names = ['saveRestorePoint', 'loadBackupFile', 'restoreWorkspace', 'resetWorkspace']
const handlers = names.map(name => {
  const start = source.search(new RegExp(`  (?:async )?function ${name}\\(`))
  const end = source.indexOf('\n  }', start) + 4
  assert.ok(start >= 0 && end > start)
  return source.slice(start, end).replace('file: File | null', 'file').replace('parsed: unknown', 'parsed')
    .replace(/await import\('\.\/([^']+)'\)/g, "await dependencies('$1')")
}).join('\n')
function deferred() {
  let resolve
  const promise = new Promise(yes => { resolve = yes })
  return { promise, resolve }
}
function harness({ draft = async () => {}, apply = async () => {}, frozen = false } = {}) {
  const records = new Map(), calls = []
  return new Function('records', 'calls', 'draft', 'apply', 'frozen', `
    let restorePoint = { records: { before: 'synthetic' } }, reviewedRestorePoint = restorePoint;
    const localWorkspaceOperation = { current: null }, restoreLoadSequence = { current: 0 };
    const LOCAL_WORKSPACE_RESTORE_POINT_KEY = 'restore', LOCAL_WORKSPACE_BACKUP_MAX_BYTES = 5000000;
    const setRestorePoint = value => { restorePoint = value };
    const setReviewedRestorePoint = value => { if (!frozen) reviewedRestorePoint = value };
    const setRestorePointLabel = () => {}, setCurrentBackup = () => {}, setNotice = () => {};
    const setRestoreBusy = () => {}, setResetBusy = () => {};
    const window = { localStorage: { removeItem: key => calls.push(['remove', key]) },
      sessionStorage: { setItem: (key,value) => records.set(key,value), removeItem: key => records.delete(key) },
      location: { assign: path => calls.push(['navigate',path]) } };
    const collectCurrentBackup = () => ({ records: { baseline: 'pre-reset' } });
    const loadRestorePoint = () => records.has('restore');
    const restoreLocalWorkspaceBackup = value => value.valid ? value : null;
    const restoreLocalWorkspaceBackupFromEvidence = () => null;
    const listLocalWorkspaceStorageKeys = () => ['synthetic'];
    const applyLocalWorkspaceBackup = async () => { calls.push(['apply']); await apply() };
    const dependencies = async () => ({ resetCommerceOrderDraftRecovery: draft,
      deleteAllPaymentQrData: async () => {}, deleteAllProductImageData: async () => {} });
    ${handlers}
    return { save: saveRestorePoint, load: loadBackupFile, restore: restoreWorkspace, reset: resetWorkspace,
      point: () => restorePoint, operation: () => localWorkspaceOperation.current, calls, records };
  `)(records, calls, draft, apply, frozen)
}
const file = data => ({ size: 100, name: 'synthetic.json', text: async () => JSON.stringify(data) })

test('customer reset preserves baseline against an earlier pending file read', { timeout: 2000 }, async () => {
  const read = deferred(), draft = deferred(), h = harness({ draft: () => draft.promise })
  const loading = h.load({ size: 100, text: () => read.promise })
  const resetting = h.reset()
  const baseline = h.records.get('restore')
  read.resolve(JSON.stringify({ valid: true, records: { stale: 'wrong' } }))
  await loading
  h.save()
  await h.load(file({ valid: true, records: { newer: 'wrong' } }))
  assert.equal(h.records.get('restore'), baseline)
  assert.deepEqual(JSON.parse(baseline), { records: { baseline: 'pre-reset' } })
  draft.resolve()
  await resetting
})
test('customer reset excludes reviewed restore and duplicate reset before React flush', { timeout: 2000 }, async () => {
  const draft = deferred(), h = harness({ draft: () => draft.promise, frozen: true })
  const resetting = h.reset()
  await h.restore()
  await h.reset()
  assert.deepEqual(h.calls, [])
  draft.resolve()
  await resetting
  assert.deepEqual(h.calls, [['remove', 'synthetic'], ['navigate', '/']])
})
test('customer restore excludes reset and duplicate restore before React flush', { timeout: 2000 }, async () => {
  const apply = deferred(), h = harness({ apply: () => apply.promise, frozen: true })
  const restoring = h.restore()
  await h.reset()
  await h.restore()
  h.save()
  await h.load(file({ valid: true, records: {} }))
  assert.deepEqual(h.calls, [['apply']])
  assert.equal(h.records.size, 0)
  apply.resolve()
  await restoring
})
test('invalid file clears previous selection; older reads cannot replace newer ones', async () => {
  const h = harness(), read = deferred()
  await h.load(file({ valid: false }))
  assert.equal(h.point(), null)
  const loading = h.load({ size: 100, text: () => read.promise })
  await h.load(file({ valid: true, records: { latest: 'yes' } }))
  read.resolve(JSON.stringify({ valid: true, records: { stale: 'no' } }))
  await loading
  assert.deepEqual(h.point().records, { latest: 'yes' })
})
test('failed reset or restore releases synchronous ownership without navigation', async () => {
  for (const name of ['reset', 'restore']) {
    const fail = async () => { throw Error('synthetic failure') }
    const h = harness({ draft: fail, apply: fail })
    await h[name]()
    assert.equal(h.operation(), null)
    assert.equal(h.calls.some(call => call[0] === 'navigate'), false)
  }
})

test('actual build assertion accepts the new guards and rejects their removal', () => {
  const verifier = readFileSync('tools/verify_app_build.mjs', 'utf8')
  const start = verifier.indexOf("if (!workspaceControlsPageSource.includes('export function WorkspaceControlsPage()')")
  const marker = "fail('customer_workspace_controls_not_isolated_or_safe')"
  const end = verifier.indexOf(marker, start) + marker.length
  assert.ok(start >= 0 && end > start)
  const check = new Function('workspaceControlsPageSource', 'fail', verifier.slice(start, end))
  const failures = text => { const result = []; check(text, code => result.push(code)); return result }
  assert.deepEqual(failures(source), [])
  for (const token of [
    'reviewedRestorePoint !== restorePoint || localWorkspaceOperation.current',
    "localWorkspaceOperation.current = 'restore'",
    "localWorkspaceOperation.current = 'reset'",
    'if (!file || localWorkspaceOperation.current) return',
    'if (localWorkspaceOperation.current) return',
    'if (sequence !== restoreLoadSequence.current) return',
  ]) {
    assert.ok(source.includes(token))
    assert.deepEqual(failures(source.replaceAll(token, 'REMOVED_GUARD')), ['customer_workspace_controls_not_isolated_or_safe'])
  }
})

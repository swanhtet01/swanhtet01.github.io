import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('showroom/src/core/SettingsPage.tsx', 'utf8')
function handler(name) {
  const start = source.search(new RegExp(`  (?:async )?function ${name}\\(`))
  const end = source.indexOf('\n  ', source.indexOf('\n  }', start) + 4)
  assert.ok(start >= 0 && end > start)
  return source.slice(start, end).replace('file: File | null', 'file')
    .replace("await import('./commerce-order-draft')", 'await recoveryModule()')
}
function harness({ armed = false, removeFails = false, applyFails = false, deferReact = false, recoveryModule = async () => ({ resetCommerceOrderDraftRecovery: async () => {} }), applyWait = async () => {} } = {}) {
  const calls = []
  const storage = new Map([['restore', 'old']])
  const window = {
    localStorage: { removeItem: key => calls.push(['remove', key]) },
    sessionStorage: {
      removeItem(key) { if (removeFails) throw Error('storage unavailable'); storage.delete(key) },
      setItem(key, value) { storage.set(key, value) },
    },
    location: { assign: path => calls.push(['navigate', path]) },
  }
  return new Function('window', 'calls', 'storage', 'armed', 'applyFails', 'deferReact', 'recoveryModule', 'applyWait', `
    let restorePoint = { records: { old: 'old' } }, restoreBusy = false, restoreArmed = armed;
    let label = 'old', notice = '';
    const restoreLoadSequence = { current: 0 };
    const localWorkspaceOperation = { current: null };
    const setRestorePoint = value => restorePoint = value;
    const setRestorePointLabel = value => label = value;
    const setRestoreArmed = value => { if (!deferReact) restoreArmed = value; };
    const setRestoreBusy = value => { if (!deferReact) restoreBusy = value; };
    const setResetBusy = () => {};
    const setNotice = value => notice = value;
    const setRestoreNotice = value => notice = value;
    const LOCAL_WORKSPACE_RESTORE_POINT_KEY = 'restore', LOCAL_WORKSPACE_BACKUP_MAX_BYTES = 5000000;
    const restoreLocalWorkspaceBackupFromEvidence = value => value.valid ? value : null;
    const applyLocalWorkspaceBackup = async (_, value) => { calls.push(['apply', value]); await applyWait(); if (applyFails) throw Error('write failed'); };
    const loadLocalWorkspaceRestorePoint = () => storage.has('restore');
    const collectLocalWorkspaceBackup = () => ({ records: { baseline: 'pre-reset' } });
    const listLocalWorkspaceStorageKeys = () => ['synthetic-workspace'];
    ${handler('saveLocalRestorePoint')}
    ${handler('loadEvidenceRestorePoint')}
    ${handler('restoreSavedLocalWorkspace')}
    ${handler('resetDemoWorkspace')}
    return { load: loadEvidenceRestorePoint, restore: restoreSavedLocalWorkspace,
      reset: resetDemoWorkspace, save: saveLocalRestorePoint,
      arm: () => setRestoreArmed(true),
      state: () => ({ restorePoint, restoreBusy, restoreArmed, label, notice }), calls, storage };
  `)(window, calls, storage, armed, applyFails, deferReact, recoveryModule, applyWait)
}
const file = value => ({ size: 100, name: 'synthetic.json', text: async () => JSON.stringify(value) })

test('restore does nothing until explicitly armed; confirmed restore navigates once', async () => {
  const h = harness()
  await h.restore()
  assert.deepEqual(h.calls, [])
  h.arm()
  await h.restore()
  await h.restore()
  assert.equal(h.calls.filter(c => c[0] === 'apply').length, 1)
  assert.equal(h.calls.filter(c => c[0] === 'navigate').length, 1)
})
test('invalid selection clears the previous ready point and confirmation', async () => {
  const h = harness({ armed: true })
  await h.load(file({ valid: false }))
  assert.equal(h.state().restorePoint, null)
  assert.equal(h.state().restoreArmed, false)
  assert.equal(h.storage.has('restore'), false)
  await h.restore()
  assert.deepEqual(h.calls, [])
})
test('late file reads cannot replace a more recent selection', async () => {
  const h = harness({ armed: true })
  let finish
  const older = h.load({ size: 100, name: 'old', text: () => new Promise(resolve => { finish = resolve }) })
  await h.load(file({ valid: true, records: { latest: 'yes' } }))
  finish(JSON.stringify({ valid: true, records: { stale: 'no' } }))
  await older
  assert.deepEqual(h.state().restorePoint.records, { latest: 'yes' })
  assert.equal(h.state().restoreArmed, false)
})
test('storage failure fails closed and never applies an old point', async () => {
  const h = harness({ armed: true, removeFails: true })
  await h.load(file({ valid: true, records: {} }))
  assert.equal(h.state().restorePoint, null)
  assert.match(h.state().notice, /storage unavailable/)
  await h.restore()
  assert.deepEqual(h.calls, [])
})
test('failed restore requires a fresh confirmation and does not navigate', async () => {
  const h = harness({ armed: true, applyFails: true })
  await h.restore()
  assert.equal(h.state().restoreArmed, false)
  assert.equal(h.state().restoreBusy, false)
  assert.match(h.state().notice, /write failed/)
  assert.equal(h.calls.some(c => c[0] === 'navigate'), false)
})
test('UI first action only arms, with explicit replacement warning and cancel', () => {
  assert.match(source, /onClick=\{\(\) => setRestoreArmed\(true\)\}/)
  assert.match(source, /onClick=\{\(\) => setRestoreArmed\(false\)\} type="button">Cancel restore/)
  assert.match(source, /Current local records will be replaced, not merged/)
  assert.match(source, /This does not restore cloud data/)
  assert.match(source, /onClick=\{restoreSavedLocalWorkspace\} type="button">Confirm replace local workspace/)
})

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('reset invalidates an earlier slow file and preserves the pre-reset baseline', { timeout: 2000 }, async () => {
  const read = deferred(), recovery = deferred()
  const h = harness({ armed: true, deferReact: true, recoveryModule: () => recovery.promise })
  const load = h.load({ size: 100, text: () => read.promise })
  const reset = h.reset()
  const baseline = h.storage.get('restore')
  assert.deepEqual(JSON.parse(baseline), { records: { baseline: 'pre-reset' } })
  read.resolve(JSON.stringify({ valid: true, records: { stale: 'wrong' } }))
  await load
  assert.equal(h.storage.get('restore'), baseline)
  await h.restore()
  h.save()
  await h.load(file({ valid: true, records: { later: 'wrong' } }))
  await h.reset()
  assert.equal(h.storage.get('restore'), baseline)
  assert.deepEqual(h.calls, [])
  recovery.resolve({ resetCommerceOrderDraftRecovery: async () => {} })
  await reset
  assert.deepEqual(h.calls, [['remove', 'synthetic-workspace'], ['navigate', '/']])
})

test('restore owns the operation before React renders; reset and duplicate restore cannot enter', { timeout: 2000 }, async () => {
  const apply = deferred()
  const h = harness({ armed: true, deferReact: true, applyWait: () => apply.promise })
  const restoring = h.restore()
  await h.reset()
  await h.restore()
  h.save()
  await h.load(file({ valid: true, records: { later: 'wrong' } }))
  assert.deepEqual(h.calls, [['apply', { records: { old: 'old' } }]])
  assert.equal(h.storage.get('restore'), 'old')
  apply.resolve()
  await restoring
  assert.equal(h.calls.filter(c => c[0] === 'navigate').length, 1)
})

test('reset blocks an already armed restore before React renders', { timeout: 2000 }, async () => {
  const recovery = deferred()
  const h = harness({ armed: true, deferReact: true, recoveryModule: () => recovery.promise })
  const resetting = h.reset()
  await h.restore()
  assert.deepEqual(h.calls, [])
  recovery.resolve({ resetCommerceOrderDraftRecovery: async () => {} })
  await resetting
  assert.equal(h.calls.some(c => c[0] === 'apply'), false)
})

test('failed reset releases ownership for a later safe selection', async () => {
  const h = harness({ recoveryModule: async () => { throw Error('recovery failed') } })
  await h.reset()
  assert.match(h.state().notice, /recovery failed/)
  await h.load(file({ valid: true, records: { latest: 'ok' } }))
  assert.deepEqual(h.state().restorePoint.records, { latest: 'ok' })
  assert.deepEqual(h.calls, [])
})

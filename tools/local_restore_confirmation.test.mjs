import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('showroom/src/core/SettingsPage.tsx', 'utf8')
function handler(name) {
  const start = source.indexOf(`  async function ${name}(`)
  const end = source.indexOf('\n  ', source.indexOf('\n  }', start) + 4)
  assert.ok(start >= 0 && end > start)
  return source.slice(start, end).replace('file: File | null', 'file')
}
function harness({ armed = false, removeFails = false, applyFails = false } = {}) {
  const calls = []
  const storage = new Map([['restore', 'old']])
  const window = {
    localStorage: {},
    sessionStorage: {
      removeItem(key) { if (removeFails) throw Error('storage unavailable'); storage.delete(key) },
      setItem(key, value) { storage.set(key, value) },
    },
    location: { assign: path => calls.push(['navigate', path]) },
  }
  return new Function('window', 'calls', 'storage', 'armed', 'applyFails', `
    let restorePoint = { records: { old: 'old' } }, restoreBusy = false, restoreArmed = armed;
    let label = 'old', notice = '';
    const restoreLoadSequence = { current: 0 };
    const setRestorePoint = value => restorePoint = value;
    const setRestorePointLabel = value => label = value;
    const setRestoreArmed = value => restoreArmed = value;
    const setRestoreBusy = value => restoreBusy = value;
    const setRestoreNotice = value => notice = value;
    const LOCAL_WORKSPACE_RESTORE_POINT_KEY = 'restore', LOCAL_WORKSPACE_BACKUP_MAX_BYTES = 5000000;
    const restoreLocalWorkspaceBackupFromEvidence = value => value.valid ? value : null;
    const applyLocalWorkspaceBackup = async (_, value) => { calls.push(['apply', value]); if (applyFails) throw Error('write failed'); };
    ${handler('loadEvidenceRestorePoint')}
    ${handler('restoreSavedLocalWorkspace')}
    return { load: loadEvidenceRestorePoint, restore: restoreSavedLocalWorkspace,
      arm: () => setRestoreArmed(true),
      state: () => ({ restorePoint, restoreBusy, restoreArmed, label, notice }), calls, storage };
  `)(window, calls, storage, armed, applyFails)
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

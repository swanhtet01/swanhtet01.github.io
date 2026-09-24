import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'
const require = createRequire(resolve('showroom/package.json'))
const { transformSync } = require('esbuild')
const source = readFileSync('showroom/src/core/ShopServiceSchedule.tsx', 'utf8')
const start = source.indexOf('  function commit(')
const end = source.indexOf('  function proof(', start)
assert.ok(start > 0 && end > start)
const code = transformSync(source.slice(start, end), { loader: 'ts' }).code
for (const mode of ['pending-success', 'rejected', 'busy', 'unready']) {
  const calls = []
  let resolveSave, rejectSave
  const pending = new Promise((resolve, reject) => { resolveSave = resolve; rejectSave = reject })
  const context = {
    managedIdentityRef: { current: { workspaceId: 'qa', userId: 'qa-user' } },
    managedVersionRef: { current: mode === 'unready' ? null : 1 },
    managedSaveBusyRef: { current: mode === 'busy' },
    schedule: { revision: 1 }, vocabulary: { singular: 'appointment', plural: 'Appointments' },
    crypto: { randomUUID: () => 'qa-command' },
    setSchedule: value => calls.push(['schedule', value]),
    setNotice: value => calls.push(['notice', value]),
    setManagedSaving: value => calls.push(['busy', value]),
    persistLocal: value => calls.push(['persist', value]),
    mutateShopServiceSchedule: () => { throw new Error('Managed proposal must not write local storage') },
    saveManagedServiceSchedule: () => { calls.push(['request']); return pending },
    ManagedTrialError: class extends Error {},
  }
  vm.createContext(context)
  vm.runInContext(code, context)
  context.commit({ revision: 2 }, 'Appointment saved.')
  assert.equal(calls.filter(([kind]) => ['schedule', 'persist'].includes(kind)).length, 0)
  if (mode === 'busy' || mode === 'unready') {
    assert.equal(calls.filter(([kind]) => kind === 'request').length, 0)
    continue
  }
  if (mode === 'rejected') rejectSave(new Error('Rejected by server'))
  else resolveSave({ version: 2, schedule: { revision: 2 } })
  await new Promise(resolve => setImmediate(resolve))
  const writes = calls.filter(([kind]) => ['schedule', 'persist'].includes(kind))
  assert.equal(writes.length, mode === 'rejected' ? 0 : 2)
  assert.equal(context.managedVersionRef.current, mode === 'rejected' ? 1 : 2)
  assert.equal(context.managedSaveBusyRef.current, false)
  if (mode === 'rejected') assert.ok(calls.some(([kind, text]) => kind === 'notice' && text.includes('not confirmed')))
}
console.log('Managed schedule acknowledgement: 4 handler scenarios passed')

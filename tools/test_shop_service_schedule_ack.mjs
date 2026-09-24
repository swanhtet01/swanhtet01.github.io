import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'
const require = createRequire(resolve('showroom/package.json'))
const { transformSync } = require('esbuild')
const source = readFileSync('showroom/src/core/ShopServiceSchedule.tsx', 'utf8')
const start = source.indexOf('  async function isCurrentScheduleIdentity(')
const end = source.indexOf('  function proof(', start)
assert.ok(start > 0 && end > start)
const code = transformSync(source.slice(start, end), { loader: 'ts' }).code
for (const mode of ['pending-success', 'rejected', 'busy', 'unready', 'switched', 'signed-out', 'unmounted']) {
  const calls = []
  let resolveSave, rejectSave
  const pending = new Promise((resolve, reject) => { resolveSave = resolve; rejectSave = reject })
  let currentIdentity = { workspaceId: 'qa', userId: 'qa-user' }
  const context = {
    currentManagedIdentity: async () => currentIdentity,
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
  const outcome = context.commit({ revision: 2 }, 'Appointment saved.')
  assert.equal(calls.filter(([kind]) => ['schedule', 'persist'].includes(kind)).length, 0)
  if (mode === 'busy' || mode === 'unready') {
    assert.equal(calls.filter(([kind]) => kind === 'request').length, 0)
    assert.equal(await outcome, false)
    continue
  }
  await new Promise(resolve => setImmediate(resolve))
  if (mode === 'switched') currentIdentity = { workspaceId: 'other', userId: 'other-user' }
  if (mode === 'signed-out') currentIdentity = null
  if (mode === 'unmounted') context.managedIdentityRef.current = null
  const accepted = mode === 'pending-success'
  if (mode === 'rejected') rejectSave(new Error('Rejected by server'))
  else resolveSave({ version: 2, schedule: { revision: 2 } })
  assert.equal(await outcome, accepted)
  const writes = calls.filter(([kind]) => ['schedule', 'persist'].includes(kind))
  assert.equal(writes.length, accepted ? 2 : 0)
  assert.equal(context.managedVersionRef.current, accepted ? 2 : 1)
  assert.equal(context.managedSaveBusyRef.current, false)
  if (mode === 'rejected') assert.ok(calls.some(([kind, text]) => kind === 'notice' && text.includes('not confirmed')))
}
console.log('Managed schedule acknowledgement: 7 handler scenarios passed')

const formStart = source.indexOf('  async function createBooking(')
const formEnd = source.indexOf('  function advanceBooking(', formStart)
assert.ok(formStart > 0 && formEnd > formStart)
const formCode = transformSync(source.slice(formStart, formEnd), { loader: 'ts' }).code
for (const saved of [false, true]) {
  let clears = 0, finish
  const pending = new Promise(resolve => { finish = resolve })
  const context = { schedule: {}, bookingDraft: { startsAt: '2026-09-25T03:00', customerName: 'QA', contact: 'qa-ref' },
    vocabulary: { singular: 'appointment' }, capitalizedSingular: 'Appointment', proof: () => ({}),
    scheduleShopServiceBooking: () => ({ revision: 1 }), commit: () => pending,
    setBookingDraft: () => { clears++ }, setNotice: () => {}, nextLocalStart: () => '' }
  vm.createContext(context); vm.runInContext(formCode, context)
  const outcome = context.createBooking({ preventDefault() {} })
  assert.equal(clears, 0)
  finish(saved); await outcome
  assert.equal(clears, saved ? 1 : 0)
}
console.log('Booking form: pending/rejected details retained; acknowledged save clears once')

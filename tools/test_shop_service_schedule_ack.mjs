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
  if (mode === 'rejected') assert.ok(calls.some(([kind, text]) => kind === 'notice' && text.includes('Save unconfirmed. Reload before retrying.')))
}
console.log('Managed schedule acknowledgement: 7 handler scenarios passed')

for (const accepted of [false, true]) {
  const updates = []
  let finish
  const pending = new Promise(resolve => { finish = resolve })
  const stored = { revision: 1 }
  const proposed = { revision: 2 }
  const context = {
    managedIdentityRef: { current: null }, managedVersionRef: { current: null },
    schedule: stored, setSchedule: value => updates.push(value), setNotice: () => {},
    planShopServiceScheduleWrite: (revision, next) => ({ revision, next }),
    mutateShopServiceSchedule: () => pending,
    readShopServiceSchedule: () => stored,
    SHOP_SERVICE_SCHEDULE_STORAGE_KEY: 'qa',
    window: { localStorage: { getItem: () => '{}' } },
  }
  vm.createContext(context)
  vm.runInContext(code, context)
  const outcome = context.commit(proposed, 'Saved.')
  assert.equal(updates.length, 0, 'Pending local save must keep the current form mounted')
  finish({ ok: accepted, error: 'Synthetic rejection' })
  assert.equal(await outcome, accepted)
  assert.deepEqual(updates, [accepted ? proposed : stored])
}
console.log('Local schedule waits for storage acknowledgement and reloads stored truth on rejection')

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
const privacyStart = source.indexOf('  async function commitPrivacy(')
const privacyEnd = source.indexOf('  async function downloadClientList(', privacyStart)
assert.ok(privacyStart > 0 && privacyEnd > privacyStart)
const privacyCode = transformSync(source.slice(privacyStart, privacyEnd), { loader: 'ts' }).code
for (const handler of ['commit', 'commitPrivacy']) {
  for (const conflict of [false, true]) {
    for (const switched of [false, true]) {
      const writes = [], notices = []
      const identity = { workspaceId: 'qa-company', userId: 'qa-owner' }
      let currentIdentity = identity, resolveResponse, notifyStarted
      const response = new Promise(resolve => { resolveResponse = resolve })
      const started = new Promise(resolve => { notifyStarted = resolve })
      class ManagedTrialError extends Error { code = 'trial_version_conflict' }
      const context = {
        managedIdentityRef: { current: identity }, managedVersionRef: { current: 1 }, managedSaveBusyRef: { current: false },
        currentManagedIdentity: async () => currentIdentity,
        crypto: { randomUUID: () => 'qa-command' }, vocabulary: { singular: 'appointment', plural: 'Appointments' },
        setManagedSaving: () => {}, setSchedule: value => writes.push(['schedule', value]),
        persistLocal: value => writes.push(['persist', value]), setNotice: value => notices.push(value),
        setRetentionDraft: value => writes.push(['retention', value]), setManagedPrivacyOwner: value => writes.push(['owner', value]),
        ManagedTrialError,
        saveManagedServiceSchedule: async () => {
          if (conflict) throw new ManagedTrialError('Conflict')
          notifyStarted(); return response
        },
        loadManagedServiceSchedule: async () => { notifyStarted(); return response },
      }
      vm.createContext(context); vm.runInContext(code + privacyCode, context)
      const outcome = context[handler]({ revision: 2 }, 'Saved.')
      await started
      if (switched) currentIdentity = { workspaceId: 'another-company', userId: 'another-user' }
      resolveResponse({ version: 3, schedule: { revision: 3, privacyPolicy: { clientRetentionDays: 365 } }, privacyOwner: true })
      assert.equal(await outcome, !conflict && !switched)
      assert.equal(context.managedVersionRef.current, switched ? 1 : 3)
      assert.equal(context.managedSaveBusyRef.current, false)
      if (switched) { assert.equal(writes.length, 0); assert.equal(notices.length, 0) }
      else assert.equal(writes.filter(([kind]) => ['schedule', 'persist'].includes(kind)).length, 2)
    }
  }
}
console.log('Commit/privacy late response and conflict readback: 8 identity scenarios passed')

const setupStart = source.indexOf('  async function createService(')
const setupEnd = source.indexOf('  if (!schedule || !projection)', setupStart)
assert.ok(setupStart > 0 && setupEnd > setupStart)
const setupCode = transformSync(source.slice(setupStart, setupEnd), { loader: 'ts' }).code
for (const handler of ['createService', 'createResource']) {
  for (const saved of [false, true]) {
    const updates = []
    let finish
    const pending = new Promise(resolve => { finish = resolve })
    const context = { schedule: { industryPackId: 'spa' },
      serviceDraft: { name: 'QA service', durationMinutes: '60', priceMmk: '1000' },
      resourceDraft: { name: 'QA room', kind: 'room' }, bookingDraft: {}, proof: () => ({}),
      registerShopService: () => ({ services: [{ id: 'qa-service' }] }),
      registerShopServiceResource: () => ({ resources: [{ id: 'qa-room' }] }),
      commit: () => pending, setNotice: () => {},
      setBookingDraft: fn => updates.push(['booking', fn({})]),
      setServiceDraft: value => updates.push(['service', value]),
      setResourceDraft: value => updates.push(['resource', value]) }
    vm.createContext(context); vm.runInContext(setupCode, context)
    const outcome = context[handler]({ preventDefault() {} })
    assert.equal(updates.length, 0, 'pending save retains form and selection')
    finish(saved); await outcome
    assert.equal(updates.length, saved ? 2 : 0, 'failed save retains form and selection')
    if (saved) assert.equal(updates[0][1][handler === 'createService' ? 'serviceId' : 'roomId'], handler === 'createService' ? 'qa-service' : 'qa-room')
  }
}
console.log('Service/resource forms retain input until acknowledged save; selections update only after success')

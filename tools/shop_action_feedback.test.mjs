import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../showroom/src/core/CoreApp.tsx', import.meta.url), 'utf8')
const start = source.indexOf('  async function confirmAction(details: ActionDetails)')
const end = source.indexOf('\n  function useChannelDraft', start)
assert.ok(start >= 0 && end > start)
const handler = source.slice(start, end).replace('details: ActionDetails', 'details')

async function run(failure = '') {
  const result = { applied: 0, notice: '', pending: 'present', actions: 0, navigated: false }
  const pendingAction = {
    id: 'ACTION', kind: 'order_settle', presentation: 'counter', subjectId: 'ORDER', summary: 'Complete sale',
    apply: async () => { if (failure === 'apply') throw new Error('write unconfirmed'); result.applied++ },
  }
  const window = {}
  Object.defineProperty(window, 'localStorage', { get() {
    if (failure === 'storage') throw new Error('storage unavailable')
    return {}
  } })
  const context = {
    Error, Date, window, pendingAction, managedIdentity: null,
    commerceLocation: { pathname: '/shop/', search: '' },
    confirmAccountableAction: () => ({ id: 'RECORD' }),
    ShopReviewRequiredError: class extends Error {},
    setPendingAction: value => { result.pending = typeof value === 'function' ? value(pendingAction) : value },
    setNotice: value => { result.notice = value },
    setActions: update => { result.actions = update([]).length },
    recordBehaviorSignal() { if (failure === 'behavior') throw new Error('optional behavior failure') },
    emitMetric() { if (failure === 'metric') throw new Error('optional metric failure') },
    commerceOrderDisplayReference: value => value,
    commerceOrderTargetId: value => value,
    navigate: () => { result.navigated = true },
  }
  const promise = runInNewContext(handler + '\nconfirmAction({ actor: "Owner", reason: "Reviewed", evidenceReference: "SRC" })', context)
  if (failure === 'apply') await assert.rejects(promise, /write unconfirmed/)
  else await promise
  return result
}

for (const failure of ['', 'storage', 'behavior', 'metric']) {
  test(`committed Shop sale feedback survives ${failure || 'normal telemetry'}`, async () => {
    const result = await run(failure)
    assert.equal(result.applied, 1)
    assert.equal(result.actions, 1)
    assert.equal(result.pending, null)
    assert.match(result.notice, /Sale ORDER completed/)
  })
}

test('real Shop mutation failure is still returned and not called completed', async () => {
  const result = await run('apply')
  assert.equal(result.applied, 0)
  assert.doesNotMatch(result.notice, /completed/)
  assert.notEqual(result.pending, null)
})

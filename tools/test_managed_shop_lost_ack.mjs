import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { createCounterTicketSession } from '../showroom/src/core/shop-parked-tickets.ts'

const { transformSync } = createRequire(resolve('showroom/package.json'))('esbuild')
const source = readFileSync('showroom/src/core/workspace-runtime.ts', 'utf8')
const start = source.indexOf('    const workspaceId = managedIdentity.workspaceId', source.indexOf('  async function mutate('))
const end = source.indexOf('\n  const visible = managedIdentity ?', start)
assert.ok(start > 0 && end > start)
const mutation = transformSync('async function mutate(eventType, commandId, evidence, transition) {\n' + source.slice(start, end), { loader: 'ts' }).code
const effectStart = source.lastIndexOf('  useEffect(() => {', source.indexOf('    loadManagedBootstrap(managedIdentity)', source.indexOf('export type CommerceStuckRecovery')))
const effectEnd = source.indexOf('  }, [managedIdentity])', effectStart) + '  }, [managedIdentity])'.length
assert.ok(effectStart > 0 && effectEnd > effectStart)
const effect = transformSync(source.slice(effectStart, effectEnd), { loader: 'ts' }).code

test('managed lost acknowledgement pauses writes; remount reads saved order without another command', async () => {
  const identity = { workspaceId: 'synthetic-company', userId: 'synthetic-user' }
  const initial = { orders: [] }
  let stored = { surface: 'commerce', version: 1, state: initial }, writes = 0, reads = 0
  const snapshotRef = { current: { state: initial, mode: 'managed-ready', workspaceId: identity.workspaceId, version: 1, error: '', writeReady: true } }
  let loaded
  const loadedPromise = new Promise(resolve => { loaded = resolve })
  const context = {
    Error, managedIdentity: identity, identityRef: { current: identity }, snapshotRef,
    sameManagedIdentity: (a, b) => a.workspaceId === b.workspaceId && a.userId === b.userId,
    validateCommerceState: state => state, // This test covers runtime orchestration, not schema validation.
    ManagedTrialError: class extends Error {},
    setManagedSnapshot: next => { snapshotRef.current = next; if (next.version === 2 && !next.error) loaded() },
    saveManagedCommerceCommand: async command => {
      writes++; stored = { surface: 'commerce', version: 2, state: command.state }
      throw new Error('Synthetic response lost after commit')
    },
    loadManagedBootstrap: async () => { reads++; return stored },
    requireManagedSurfaceState: record => record,
    managedBootstrapHasCapability: () => true,
    managedCommerceView: (record, workspaceId, writeReady) => ({ ...record, workspaceId, writeReady, mode: 'managed-ready', error: '' }),
    createEmptyCommerce: () => ({ orders: [] }),
    useEffect: callback => callback(),
  }
  const mutate = runInNewContext(mutation + '\nmutate', context)
  const basket = createCounterTicketSession(null, null)
  basket.dispatch({ kind: 'save', basket: { cart: { 'SYNTHETIC-1': 1 }, customer: '', payment: 'Cash', outcome: 'open_order' } })
  await assert.rejects(mutate('commerce.order.created', 'synthetic-command', {}, () => ({ orders: [{ id: 'SYNTHETIC-ORDER' }] })), /response lost/)
  assert.equal(writes, 1)
  assert.match(snapshotRef.current.error, /response lost/)
  assert.equal(!snapshotRef.current.error && snapshotRef.current.writeReady, false)
  basket.deactivate()
  const remountedBasket = createCounterTicketSession(null, null)
  assert.deepEqual(remountedBasket.getSnapshot().state.cart, {})
  runInNewContext(effect, context)
  await loadedPromise
  assert.equal(snapshotRef.current.state.orders[0].id, 'SYNTHETIC-ORDER')
  assert.equal(snapshotRef.current.version, 2)
  assert.equal(snapshotRef.current.error, '')
  assert.equal(reads, 1)
  assert.equal(writes, 1)
})

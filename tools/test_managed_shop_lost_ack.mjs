import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { createCounterTicketSession } from '../showroom/src/core/shop-parked-tickets.ts'
import {
  convertCommerceWebsiteIntake,
  createCommerceWebsiteIntake,
  createSeedCommerce,
  validateCommerceState,
} from '../showroom/src/core/commerce-workspace.ts'

const { transformSync } = createRequire(resolve('showroom/package.json'))('esbuild')
const source = readFileSync('showroom/src/core/workspace-runtime.ts', 'utf8')
const start = source.indexOf('    const workspaceId = managedIdentity.workspaceId', source.indexOf('  async function mutate('))
const end = source.indexOf('\n  const visible = managedIdentity ?', start)
assert.ok(start > 0 && end > start)
const mutation = transformSync('async function mutate(eventType, commandId, evidence, transition) {\n' + source.slice(start, end), { loader: 'ts' }).code
const effectStart = source.lastIndexOf('  useEffect(() => {', source.indexOf('    loadManagedBootstrap(managedIdentity)', source.indexOf('export type CommerceStuckRecovery')))
const effectEndToken = '  }, [managedIdentity, managedLoadAttempt])'
const effectEnd = source.indexOf(effectEndToken, effectStart) + effectEndToken.length
assert.ok(effectStart > 0 && effectEnd > effectStart)
const effect = transformSync(source.slice(effectStart, effectEnd), { loader: 'ts' }).code
const managedSource = readFileSync('showroom/src/core/managed-trial.ts', 'utf8')
const intentStart = managedSource.indexOf('function managedCounterOrderIntent(')
const intentEnd = managedSource.indexOf('\nfunction managedStorefrontRequestIntent(', intentStart)
assert.ok(intentStart > 0 && intentEnd > intentStart)
const intentCode = transformSync(managedSource.slice(intentStart, intentEnd), { loader: 'ts' }).code
const managedCounterOrderIntent = runInNewContext(intentCode + '\nmanagedCounterOrderIntent', {
  Date,
  Number,
  isRecord: value => typeof value === 'object' && value !== null && !Array.isArray(value),
  errorManagedOrderIntentInvalid: message => new Error(message),
})
const saveStart = managedSource.indexOf('export async function saveManagedCommerceCommand(')
const saveEnd = managedSource.indexOf('\nfunction managedProductionJobIntent(', saveStart)
assert.ok(saveStart > 0 && saveEnd > saveStart)
const saveCode = transformSync(
  managedSource.slice(saveStart, saveEnd).replace('export async function saveManagedCommerceCommand(', 'async function saveManagedCommerceCommand('),
  { loader: 'ts' },
).code

test('managed lost acknowledgement pauses writes; remount reads saved order without another command', async () => {
  const identity = { workspaceId: 'synthetic-company', userId: 'synthetic-user' }
  const shiftId = 'SHIFT-AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
  const initial = {
    orders: [],
    closes: [],
    operatingUnits: [{
      id: 'UNIT-11111111-1111-4111-8111-111111111111',
      name: 'Main shop',
      registration: { capturedAt: '2026-10-04T01:00:00.000Z' },
    }],
    shiftSessions: [{
      id: shiftId,
      unitId: 'UNIT-11111111-1111-4111-8111-111111111111',
      opening: { capturedAt: '2026-10-04T01:05:00.000Z' },
    }],
  }
  let stored = { surface: 'commerce', version: 1, state: initial }, writes = 0, reads = 0
  const snapshotRef = { current: { state: initial, mode: 'managed-ready', workspaceId: identity.workspaceId, version: 1, error: '', writeReady: true } }
  let loaded
  const loadedPromise = new Promise(resolve => { loaded = resolve })
  const context = {
    Error, managedIdentity: identity, managedLoadAttempt: 0, identityRef: { current: identity }, snapshotRef,
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
    reportManagedPersistenceFailure: () => {},
    useEffect: callback => callback(),
  }
  const mutate = runInNewContext(mutation + '\nmutate', context)
  const basket = createCounterTicketSession(null, null)
  basket.dispatch({ kind: 'save', basket: { cart: { 'SYNTHETIC-1': 1 }, customer: '', payment: 'Cash', outcome: 'open_order' } })
  await assert.rejects(mutate('commerce.order.created', 'synthetic-command', {}, () => ({
    ...initial,
    orders: [{ id: 'SYNTHETIC-ORDER', shiftId }],
  })), /response lost/)
  assert.equal(writes, 1)
  assert.match(snapshotRef.current.error, /response lost/)
  assert.equal(!snapshotRef.current.error && snapshotRef.current.writeReady, false)
  basket.deactivate()
  const remountedBasket = createCounterTicketSession(null, null)
  assert.deepEqual(remountedBasket.getSnapshot().state.cart, {})
  runInNewContext(effect, context)
  await loadedPromise
  assert.equal(snapshotRef.current.state.orders[0].id, 'SYNTHETIC-ORDER')
  assert.equal(snapshotRef.current.state.orders[0].shiftId, shiftId)
  assert.equal(snapshotRef.current.state.shiftSessions[0].id, shiftId)
  assert.equal(snapshotRef.current.version, 2)
  assert.equal(snapshotRef.current.error, '')
  assert.equal(reads, 1)
  assert.equal(writes, 1)
})

test('managed order intent preserves one open reviewed shift and rejects detached orders', () => {
  const shiftId = 'SHIFT-AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
  const unitId = 'UNIT-11111111-1111-4111-8111-111111111111'
  const evidence = {
    actionId: 'ACT-MANAGED-SHIFT-ORDER',
    capturedAt: '2026-10-04T02:00:00.000Z',
    actor: 'Founder',
    reason: 'Complete reviewed counter order.',
    evidenceReference: 'SHIFT-ORDER:1',
  }
  const order = {
    id: 'ORD-SHIFT-BOUND',
    shiftId,
    createdAt: evidence.capturedAt,
    customer: 'Guest',
    channel: 'Walk-in',
    payment: 'Cash',
    paymentStatus: 'pending',
    status: 'confirmed',
    fulfilment: 'pickup',
    fulfilmentReference: 'Counter ORD-SHIFT-BOUND',
    promisedAt: '2026-10-04T02:30:00.000Z',
    lines: [{ sku: 'SKU-1', quantity: 1 }],
  }
  const scoped = {
    orders: [order],
    movements: [{ kind: 'reserve', actionId: evidence.actionId, orderId: order.id }],
    closes: [],
    operatingUnits: [{ id: unitId }],
    shiftSessions: [{ id: shiftId, unitId, opening: { capturedAt: '2026-10-04T01:00:00.000Z' } }],
  }
  assert.equal(managedCounterOrderIntent(scoped, evidence).shiftId, shiftId)
  assert.throws(() => managedCounterOrderIntent({ ...scoped, orders: [{ ...order, shiftId: undefined }] }, evidence), /open operating shift/)
  assert.throws(() => managedCounterOrderIntent({ ...scoped, closes: [{ shiftId }] }, evidence), /open operating shift/)
  assert.throws(() => managedCounterOrderIntent({ ...scoped, operatingUnits: undefined }, evidence), /record is incomplete/)
  assert.throws(() => managedCounterOrderIntent({
    orders: [order],
    movements: scoped.movements,
    closes: [],
  }, evidence), /cannot name a shift/)
})

test('managed order command sends the exact reviewed shift in the wire intent', async () => {
  const shiftId = 'SHIFT-AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
  const unitId = 'UNIT-11111111-1111-4111-8111-111111111111'
  const evidence = {
    actionId: 'ACT-MANAGED-SHIFT-WIRE',
    capturedAt: '2026-10-04T02:00:00.000Z',
    actor: 'Founder',
    reason: 'Send reviewed counter order.',
    evidenceReference: 'SHIFT-ORDER:WIRE',
  }
  const order = {
    id: 'ORD-SHIFT-WIRE',
    shiftId,
    createdAt: evidence.capturedAt,
    customer: 'Guest',
    channel: 'Walk-in',
    payment: 'Cash',
    paymentStatus: 'pending',
    status: 'confirmed',
    fulfilment: 'pickup',
    fulfilmentReference: 'Counter ORD-SHIFT-WIRE',
    promisedAt: '2026-10-04T02:30:00.000Z',
    lines: [{ sku: 'SKU-1', quantity: 1 }],
  }
  let wireBody
  const saveManagedCommerceCommand = runInNewContext(saveCode + '\nsaveManagedCommerceCommand', {
    managedCounterOrderIntent,
    managedStorefrontRequestIntent: () => null,
    authorizedRequest: async (_path, options) => {
      wireBody = JSON.parse(options.body)
      return { result: { version: 2 } }
    },
  })
  await saveManagedCommerceCommand({
    commandId: 'COMMAND-SHIFT-WIRE',
    evidence,
    eventType: 'commerce.order.created',
    expectedVersion: 1,
    identity: { workspaceId: 'synthetic-company', userId: 'synthetic-user' },
    state: {
      orders: [order],
      movements: [{ kind: 'reserve', actionId: evidence.actionId, orderId: order.id }],
      closes: [],
      operatingUnits: [{ id: unitId }],
      shiftSessions: [{ id: shiftId, unitId, opening: { capturedAt: '2026-10-04T01:00:00.000Z' } }],
    },
  })
  assert.equal(wireBody.payload.intent.shiftId, shiftId)
  assert.equal(wireBody.payload.intent.orderId, order.id)
})

test('Website intake conversion binds the reviewed open shift and fails closed without it', () => {
  const unitId = 'UNIT-11111111-1111-4111-8111-111111111111'
  const shiftId = 'SHIFT-AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
  const proof = (actionId, capturedAt) => ({
    actionId,
    capturedAt,
    actor: 'Founder',
    reason: `Reviewed ${actionId}.`,
    evidenceReference: `EVIDENCE:${actionId}`,
  })
  let state = validateCommerceState({
    ...createSeedCommerce(),
    operatingUnits: [{ id: unitId, name: 'Main shop', registration: proof('ACT-UNIT-REGISTER', '2026-10-04T01:00:00.000Z') }],
    shiftSessions: [{ id: shiftId, unitId, opening: proof('ACT-SHIFT-OPEN', '2026-10-04T01:05:00.000Z') }],
  })
  state = createCommerceWebsiteIntake(state, {
    id: 'WINT-SHIFT001',
    source: {
      fingerprint: 'web-a1b2c3d4',
      approvalId: 'approval-shift-1',
      snapshotId: 'snapshot-shift-1',
      pageId: 'page-products',
      siteName: 'SuperMega',
      pagePath: '/products',
    },
    sku: state.items[0].sku,
    quantity: 1,
  }, proof('ACT-WEBSITE-INTAKE', '2026-10-04T01:10:00.000Z'))
  assert.ok(state)
  const conversionProof = proof('ACT-WEBSITE-CONVERT', '2026-10-04T01:15:00.000Z')
  const input = {
    customer: 'Website customer',
    fulfilmentMethod: 'pickup',
    paymentMethod: 'manual_qr',
    promisedAt: '2026-10-04T02:00:00.000Z',
    shiftId,
  }
  assert.equal(convertCommerceWebsiteIntake(state, 'WINT-SHIFT001', { ...input, shiftId: undefined }, conversionProof), null)
  assert.equal(convertCommerceWebsiteIntake(state, 'WINT-SHIFT001', { ...input, shiftId: 'SHIFT-BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB' }, conversionProof), null)
  const converted = convertCommerceWebsiteIntake(state, 'WINT-SHIFT001', input, conversionProof)
  assert.ok(converted)
  assert.equal(converted.orders[0].shiftId, shiftId)
  assert.equal(convertCommerceWebsiteIntake(converted, 'WINT-SHIFT001', input, conversionProof), converted)
})


test('rendered recovery controls distinguish uncertain writes from setup and access failures', () => {
  const require = createRequire(resolve('showroom/package.json'))
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const app = readFileSync('showroom/src/core/CoreApp.tsx', 'utf8')
  const start = app.indexOf('  const commerceWriteBanner = ')
  const end = app.indexOf('\n  </div>', start) + '\n  </div>'.length
  assert.ok(start >= 0 && end > start)
  const code = transformSync(app.slice(start, end) + ';\ncommerceWriteBanner', { loader: 'tsx', jsx: 'transform' }).code
  function render(overrides) {
    let reloads = 0
    const element = runInNewContext(code, {
      React, Link: ({ to, children }) => React.createElement('a', { href: to }, children),
      coreUi: { m: 'managed-ready' },
      commerceCanWrite: false, commerceStorageError: 'Synthetic failure',
      managedIdentity: { workspaceId: 'synthetic', userId: 'synthetic' },
      workspaceMode: 'managed-ready', commerceSync: { status: 'ready', message: '' },
      localEvictionWarningReplacesWriteBanner: false, managedVersion: 2, notice: '', window: { location: { reload: () => { reloads++ } } },
      ...overrides,
    })
    const html = renderToStaticMarkup(element)
    assert.equal(reloads, 0, 'rendering never reloads or retries automatically')
    return html
  }
  const uncertain = render({})
  assert.match(uncertain, />Reload Shop<\/button>/)
  assert.doesNotMatch(uncertain, /Open Settings/)
  for (const workspaceMode of ['managed-loading', 'managed-error', 'managed-unprovisioned']) {
    const html = render({ workspaceMode })
    assert.match(html, /href="\/settings\/#controls"/)
    assert.doesNotMatch(html, />Reload Shop<\/button>/)
    assert.doesNotMatch(html, /sale again|already be saved/)
  }
  const ready = render({ commerceCanWrite: true, commerceStorageError: '' })
  assert.doesNotMatch(ready, /Reload Shop|Open Settings/)
  const localPending = render({ managedIdentity: null, workspaceMode: 'local', commerceSync: { status: 'pending', message: 'Synthetic pending write' } })
  assert.match(localPending, />Reload Shop<\/button>/)
})

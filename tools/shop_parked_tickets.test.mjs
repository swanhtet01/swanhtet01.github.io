import test from 'node:test'
import assert from 'node:assert/strict'
import { COUNTER_TICKETS_KEY, emptyCounterBasket, parseCounterTickets, transitionCounterTickets, mutateCounterTickets, createCounterTicketSession } from '../showroom/src/core/shop-parked-tickets.ts'
const input = { cart: { 'TEA-1': 2 }, customer: '', payment: 'Cash', outcome: 'paid_handoff' }
const saved = () => transitionCounterTickets(parseCounterTickets(null), { kind: 'save', basket: input })
test('legacy recovery migrates without changing basket contents', () => {
  const result = parseCounterTickets(JSON.stringify(input))
  assert.deepEqual(result.cart, input.cart)
  assert.equal(result.revision, 0)
  assert.deepEqual(result.parked, [])
})
test('park, serve another table, reload and resume preserves both tickets without a sale', () => {
  const first = transitionCounterTickets(saved(), { kind: 'park', id: 'one', label: 'Table 1' })
  const second = transitionCounterTickets(first, { kind: 'save', basket: { ...input, cart: { 'TEA-1': 1 } } })
  const both = transitionCounterTickets(second, { kind: 'park', id: 'two', label: 'Table 2' })
  const resumed = transitionCounterTickets(parseCounterTickets(JSON.stringify(both)), { kind: 'resume', id: 'one' })
  assert.deepEqual(resumed.cart, input.cart)
  assert.equal(resumed.parked[0].id, 'two')
  assert.equal(resumed.parked[0].cart['TEA-1'], 1)
  assert.equal(resumed.activeLabel, 'Table 1')
  assert.equal('orders' in resumed, false)
})

test('serial session saves rapid edits then parks without an autosave erasing the ticket', async () => {
  let raw = null, writes = 0
  const storage = { getItem: key => key === COUNTER_TICKETS_KEY ? raw : null, setItem: (_key, value) => { raw = value; writes++ } }
  const locks = { request: async (_name, _options, callback) => callback() }
  const session = createCounterTicketSession(storage, locks)
  session.dispatch({ kind: 'save', basket: input })
  session.dispatch({ kind: 'save', basket: { ...input, customer: 'Synthetic table' } })
  session.dispatch({ kind: 'park', id: 'one', label: 'Table 1' })
  assert.equal(session.checkpoint(), false)
  await session.settled()
  assert.equal(writes, 3)
  assert.equal(session.checkpoint(), true)
  assert.equal(parseCounterTickets(raw).parked[0].customer, 'Synthetic table')
  const restored = createCounterTicketSession(storage, locks)
  restored.dispatch({ kind: 'resume', id: 'one' })
  await restored.settled()
  assert.equal(restored.getSnapshot().state.activeLabel, 'Table 1')
  restored.dispatch({ kind: 'save', basket: emptyCounterBasket() })
  await restored.settled()
  assert.equal(restored.getSnapshot().state.activeLabel, '')
})

test('failed or changed storage stops the queue and checkout; malformed recovery is never overwritten', async () => {
  let raw = '{', writes = 0
  const storage = { getItem: key => key === COUNTER_TICKETS_KEY ? raw : null, setItem: () => { writes++; throw new Error('quota') } }
  const locks = { request: async (_name, _options, callback) => callback() }
  const malformed = createCounterTicketSession(storage, locks)
  assert.equal(malformed.dispatch({ kind: 'save', basket: input }), false)
  assert.equal(malformed.checkpoint(), false)
  assert.equal(raw, '{')
  raw = null
  const session = createCounterTicketSession(storage, locks)
  session.dispatch({ kind: 'save', basket: input })
  session.dispatch({ kind: 'park', id: 'one', label: 'Table 1' })
  await session.settled()
  assert.equal(writes, 1)
  assert.equal(session.getSnapshot().pending, 0)
  assert.equal(session.getSnapshot().blocked, true)
  assert.equal(session.checkpoint(), false)
  const fresh = createCounterTicketSession(storage, locks)
  raw = JSON.stringify(saved())
  assert.equal(fresh.checkpoint(), false)
})

test('scope departure cancels delayed writes inside the lock; managed session performs no storage access', async () => {
  let raw = null, release
  const storage = { getItem: key => key === COUNTER_TICKETS_KEY ? raw : null, setItem: (_key, value) => { raw = value } }
  const locks = { request: (_name, _options, callback) => new Promise((resolve, reject) => { release = () => callback().then(resolve, reject) }) }
  const session = createCounterTicketSession(storage, locks)
  session.dispatch({ kind: 'save', basket: input })
  await Promise.resolve()
  session.deactivate()
  await release()
  await session.settled()
  assert.equal(raw, null)
  const managed = createCounterTicketSession(null, null)
  managed.dispatch({ kind: 'save', basket: input })
  assert.equal(managed.checkpoint(), true)
  assert.equal(managed.getSnapshot().pending, 0)
  assert.equal(raw, null)
})
test('busy basket, duplicate labels/ids and malformed recovery fail without mutation', () => {
  const current = saved(), original = JSON.stringify(current)
  assert.throws(() => transitionCounterTickets(current, { kind: 'resume', id: 'one' }))
  const parked = transitionCounterTickets(current, { kind: 'park', id: 'one', label: 'Table 1' })
  const next = transitionCounterTickets(parked, { kind: 'save', basket: input })
  assert.throws(() => transitionCounterTickets(next, { kind: 'park', id: 'two', label: 'table 1' }))
  assert.throws(() => transitionCounterTickets(next, { kind: 'park', id: 'one', label: 'Table 2' }))
  assert.throws(() => parseCounterTickets('{'))
  assert.throws(() => transitionCounterTickets(current, { kind: 'save', basket: { ...input, cart: { tea: -1 } } }))
  assert.equal(JSON.stringify(current), original)
})
test('storage mutation is one write; stale tabs, reset and failed storage preserve previous data', async () => {
  let raw = JSON.stringify(saved()), writes = 0, reset = null
  const storage = { getItem: key => key === COUNTER_TICKETS_KEY ? raw : reset, setItem: (_key, value) => { writes++; raw = value } }
  const locks = { request: async (_name, _options, callback) => callback() }
  const before = raw
  await mutateCounterTickets(storage, locks, before, null, { kind: 'park', id: 'one', label: 'Table 1' })
  assert.equal(writes, 1)
  await assert.rejects(mutateCounterTickets(storage, locks, before, null, { kind: 'save', basket: input }))
  reset = '1'
  await assert.rejects(mutateCounterTickets(storage, locks, raw, null, { kind: 'resume', id: 'one' }))
  const retained = raw
  await assert.rejects(mutateCounterTickets({ ...storage, setItem: () => { throw new Error('quota') } }, locks, raw, '1', { kind: 'resume', id: 'one' }))
  assert.equal(raw, retained)
  assert.equal(writes, 1)
})
test('empty or unknown tickets do not erase work', () => {
  assert.throws(() => transitionCounterTickets(parseCounterTickets(null), { kind: 'park', id: 'one', label: 'Table 1' }))
  assert.throws(() => transitionCounterTickets(parseCounterTickets(null), { kind: 'resume', id: 'missing' }))
  assert.deepEqual(emptyCounterBasket().cart, {})
})
test('ticket count, payload size, unsafe quantities and malformed reset markers are bounded', async () => {
  let state = parseCounterTickets(null)
  for (let i = 0; i < 24; i++) {
    state = transitionCounterTickets(state, { kind: 'save', basket: input })
    state = transitionCounterTickets(state, { kind: 'park', id: `ticket-${i}`, label: `Table ${i}` })
  }
  state = transitionCounterTickets(state, { kind: 'save', basket: input })
  assert.throws(() => transitionCounterTickets(state, { kind: 'park', id: 'overflow', label: 'Table 25' }))
  assert.throws(() => parseCounterTickets(' '.repeat(65_537)))
  assert.throws(() => transitionCounterTickets(state, { kind: 'save', basket: { ...input, cart: { tea: Number.MAX_SAFE_INTEGER } } }))
  let writes = 0
  const storage = { getItem: () => null, setItem: () => { writes++ } }
  const locks = { request: async (_name, _options, callback) => callback() }
  await assert.rejects(mutateCounterTickets(storage, locks, null, 'broken', { kind: 'save', basket: input }))
  assert.equal(writes, 0)
})
test('queued transition cannot be changed through caller input mutation', async () => {
  let queued, raw = null
  const storage = { getItem: key => key === COUNTER_TICKETS_KEY ? raw : null, setItem: (_key, value) => { raw = value } }
  const locks = { request: (_name, _options, callback) => new Promise((resolve, reject) => { queued = () => callback().then(resolve, reject) }) }
  const action = { kind: 'save', basket: { ...input, cart: { ...input.cart } } }
  const pending = mutateCounterTickets(storage, locks, null, null, action)
  action.basket.cart['TEA-1'] = 99
  await queued()
  await pending
  assert.equal(parseCounterTickets(raw).cart['TEA-1'], 2)
})

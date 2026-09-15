import test from 'node:test'
import assert from 'node:assert/strict'
import { COUNTER_TICKETS_KEY, emptyCounterBasket, parseCounterTickets, transitionCounterTickets, mutateCounterTickets } from '../showroom/src/core/shop-parked-tickets.ts'
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
  assert.equal('orders' in resumed, false)
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

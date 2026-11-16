import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COUNTER_TICKETS_KEY, emptyCounterBasket, parseCounterTickets, transitionCounterTickets, mutateCounterTickets, createCounterTicketSession } from '../showroom/src/core/shop-parked-tickets.ts'
import * as ticketModule from '../showroom/src/core/shop-parked-tickets.ts'
const input = { cart: { 'TEA-1': 2 }, customer: '', payment: 'Cash', outcome: 'paid_handoff' }
const saved = () => transitionCounterTickets(parseCounterTickets(null), { kind: 'save', basket: input })

function actualBeforeCommit(tickets, persistLocalDraft, reviewedRevision) {
  const source = readFileSync(new URL('../showroom/src/core/CoreApp.tsx', import.meta.url), 'utf8')
  const start = source.indexOf('beforeCommit: async (orderId) => {')
  const end = source.indexOf('\n      },', start)
  assert.ok(start > 0 && end > start)
  const callback = source.slice(start + 'beforeCommit: '.length, end) + '\n}'
  const create = new Function('tickets', 'persistLocalDraft', 'reviewedRevision', 'CounterTicketStalePrewriteError', "let securedCheckoutId = ''; return (" + callback + ')')
  return create(tickets, persistLocalDraft, reviewedRevision, ticketModule.CounterTicketStalePrewriteError)
}

test('memory-only company baskets remain isolated without global storage fallback', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('Global storage forbidden') } })
  try {
    const first = createCounterTicketSession(null, null, 'Synthetic A')
    assert.equal(first.dispatch({ kind: 'save', basket: { ...input, customer: 'Synthetic A' } }), true)
    await first.settled()
    assert.equal(first.getSnapshot().pending, 0)
    assert.equal(first.checkpoint(), true)
    const second = createCounterTicketSession(null, null, 'Synthetic B')
    assert.deepEqual(second.getSnapshot().state.cart, {})
    assert.equal(second.getSnapshot().state.customer, 'Synthetic B')
    assert.deepEqual(first.getSnapshot().state.cart, input.cart)
    first.deactivate()
    assert.equal(first.dispatch({ kind: 'save', basket: { ...input, cart: {} } }), false)
    assert.equal(first.checkpoint(), false)
    assert.deepEqual(first.getSnapshot().state.cart, input.cart)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete globalThis.localStorage
  }
})
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

test('confirmed commerce plus failed clear cannot restore a sellable basket; siblings survive resolution', async () => {
  let state = transitionCounterTickets(saved(), { kind: 'park', id: 'sibling', label: 'Table 2' })
  state = transitionCounterTickets(state, { kind: 'save', basket: input })
  let raw = JSON.stringify(state), failClear = false
  const storage = { getItem: key => key === COUNTER_TICKETS_KEY ? raw : null, setItem: (_key, value) => { if (failClear) throw new Error('quota'); raw = value } }
  const locks = { request: async (_name, _options, callback) => callback() }
  const session = createCounterTicketSession(storage, locks)
  assert.equal(session.dispatch({ kind: 'begin_checkout', orderId: 'ORD-ONE' }), true)
  await session.settled()
  assert.equal(session.checkpoint('ORD-ONE'), true)
  const recordedOrders = new Set(['ORD-ONE']) // Commerce commits only after the durable intent above.
  failClear = true
  session.dispatch({ kind: 'resolve_checkout', orderId: 'ORD-ONE' })
  await session.settled()
  const reload = createCounterTicketSession(storage, locks)
  assert.equal(reload.checkpoint(), false)
  assert.equal(reload.getSnapshot().state.checkoutOrderId, 'ORD-ONE')
  assert.equal(reload.dispatch({ kind: 'save', basket: input }), false)
  assert.equal(reload.dispatch({ kind: 'begin_checkout', orderId: 'ORD-TWO' }), false)
  assert.equal(reload.dispatch({ kind: 'resolve_checkout', orderId: 'WRONG' }), false)
  failClear = false
  if (recordedOrders.has('ORD-ONE')) reload.dispatch({ kind: 'resolve_checkout', orderId: 'ORD-ONE' })
  await reload.settled()
  assert.equal(reload.checkpoint(), true)
  assert.deepEqual(reload.getSnapshot().state.cart, {})
  assert.equal(reload.getSnapshot().state.parked[0].id, 'sibling')
})

test('unmounted delayed post-commit clear leaves durable checkout identity on reload', async () => {
  let raw = JSON.stringify(transitionCounterTickets(saved(), { kind: 'begin_checkout', orderId: 'ORD-ONE' })), release
  const storage = { getItem: key => key === COUNTER_TICKETS_KEY ? raw : null, setItem: (_key, value) => { raw = value } }
  const locks = { request: (_name, _options, callback) => new Promise((resolve, reject) => { release = () => callback().then(resolve, reject) }) }
  const session = createCounterTicketSession(storage, locks)
  session.dispatch({ kind: 'resolve_checkout', orderId: 'ORD-ONE' })
  await Promise.resolve()
  session.deactivate()
  await release()
  await session.settled()
  assert.equal(createCounterTicketSession(storage, locks).checkpoint(), false)
  assert.equal(parseCounterTickets(raw).checkoutOrderId, 'ORD-ONE')
})

test('UI persists checkout identity before commerce and only offers recorded-order recovery', () => {
  const source = readFileSync(new URL('../showroom/src/core/CoreApp.tsx', import.meta.url), 'utf8')
  const start = source.indexOf('function reviewCounterSale('), end = source.indexOf('function recordOrder(', start)
  const flow = source.slice(start, end)
  assert.ok(flow.indexOf('await review.beforeCommit(order.id)') < flow.indexOf("await mutateCommerce('commerce.order.created'"))
  assert.ok(flow.includes('review.onCommitted(order.id)'))
  assert.ok(source.includes('recordedOrderIds.includes(checkoutOrderId)'))
  assert.ok(source.includes('await tickets.settled()'))
  assert.ok(source.includes('if (tickets.checkpoint(orderId)) return true'))
  assert.ok(source.includes("if (tickets.getSnapshot().prewriteFailure === 'stale_ticket_revision') throw new CounterTicketStalePrewriteError()"))
  assert.ok(source.includes('if (detail === COUNTER_TICKET_STALE_PREWRITE_MESSAGE) return bi(detail)'))
})


test('actual Counter review callback retries only its secured unchanged checkout', async () => {
  let raw = JSON.stringify(saved())
  const storage = { getItem: key => key === COUNTER_TICKETS_KEY ? raw : null, setItem: (_key, value) => { raw = value } }
  const locks = { request: async (_name, _options, callback) => callback() }
  const session = createCounterTicketSession(storage, locks)
  const reviewedRevision = session.getSnapshot().state.revision
  const beforeCommit = actualBeforeCommit(session, true, reviewedRevision)
  assert.equal(await beforeCommit('ORD-RETRY'), true)
  const secured = raw
  assert.equal(await beforeCommit('ORD-RETRY'), true)
  assert.equal(raw, secured, 'retry does not begin a second checkout')
  assert.equal(await beforeCommit('ORD-OTHER'), false)
  const unrelatedReview = actualBeforeCommit(session, true, reviewedRevision)
  assert.equal(await unrelatedReview('ORD-RETRY'), false, 'another review cannot adopt the checkout')
  session.dispatch({ kind: 'resolve_checkout', orderId: 'ORD-RETRY' })
  await session.settled()
  assert.equal(await beforeCommit('ORD-RETRY'), false, 'resolved checkout cannot be reused')
  const changed = createCounterTicketSession(null, null)
  changed.dispatch({ kind: 'save', basket: input })
  const stale = actualBeforeCommit(changed, false, changed.getSnapshot().state.revision)
  changed.dispatch({ kind: 'save', basket: { ...input, customer: 'Changed' } })
  assert.equal(await stale('ORD-STALE'), false)
})

test('actual precommit distinguishes a proven stale same-reset ticket before a new sale', async () => {
  let raw = JSON.stringify(saved()), writes = 0
  const storage = {
    getItem: key => key === COUNTER_TICKETS_KEY ? raw : null,
    setItem: (_key, value) => { writes++; raw = value },
  }
  const locks = { request: async (_name, _options, callback) => callback() }
  const staleTab = createCounterTicketSession(storage, locks)
  const otherTab = createCounterTicketSession(storage, locks)
  const beforeCommit = actualBeforeCommit(staleTab, true, staleTab.getSnapshot().state.revision)
  assert.equal(otherTab.dispatch({ kind: 'save', basket: { ...input, customer: 'Other tab' } }), true)
  await otherTab.settled()
  const retained = raw
  await assert.rejects(beforeCommit('ORD-STALE'), error => error?.code === 'counter_ticket_stale_prewrite')
  assert.equal(raw, retained)
  assert.equal(writes, 1, 'the stale attempt made no additional ticket write')
  assert.equal(staleTab.getSnapshot().prewriteFailure, 'stale_ticket_revision')
  assert.equal(staleTab.getSnapshot().blocked, true)
  assert.equal(await beforeCommit('ORD-STALE'), false, 'a repeat cannot reuse specific no-sale guidance')
})

test('typed outcome is confined to a valid higher same-reset revision under checkout lock', async () => {
  const expectedRaw = JSON.stringify(saved())
  let raw = JSON.stringify(transitionCounterTickets(parseCounterTickets(expectedRaw), {
    kind: 'save', basket: { ...input, customer: 'Other tab' },
  })), writes = 0, lockName = '', lockMode = ''
  const retained = raw
  const storage = {
    getItem: key => key === COUNTER_TICKETS_KEY ? raw : null,
    setItem: (_key, value) => { writes++; raw = value },
  }
  const locks = { request: async (name, options, callback) => { lockName = name; lockMode = options.mode; return callback() } }
  await assert.rejects(
    mutateCounterTickets(storage, locks, expectedRaw, null, { kind: 'begin_checkout', orderId: 'ORD-STALE' }),
    error => error instanceof ticketModule.CounterTicketStalePrewriteError
      && error.code === 'counter_ticket_stale_prewrite'
      && error.message === ticketModule.COUNTER_TICKET_STALE_PREWRITE_MESSAGE,
  )
  assert.equal(lockName, 'supermega:shop:order-draft:reset')
  assert.equal(lockMode, 'exclusive')
  assert.equal(writes, 0)
  assert.equal(raw, retained)
})

test('reset, malformed, lower, equal, other mutation and context changes remain generic without a write', async () => {
  const expectedRaw = JSON.stringify(saved())
  const higherRaw = JSON.stringify(transitionCounterTickets(parseCounterTickets(expectedRaw), {
    kind: 'save', basket: { ...input, customer: 'Other tab' },
  }))
  const sameRevisionRaw = JSON.stringify({ ...parseCounterTickets(expectedRaw), customer: 'Changed without revision' })
  const lowerExpected = higherRaw
  const cases = [
    ['reset generation', expectedRaw, higherRaw, '1', { kind: 'begin_checkout', orderId: 'ORD-RESET' }, true],
    ['malformed actual', expectedRaw, '{', null, { kind: 'begin_checkout', orderId: 'ORD-MALFORMED' }, true],
    ['lower actual revision', lowerExpected, expectedRaw, null, { kind: 'begin_checkout', orderId: 'ORD-LOWER' }, true],
    ['same revision changed bytes', expectedRaw, sameRevisionRaw, null, { kind: 'begin_checkout', orderId: 'ORD-EQUAL' }, true],
    ['other ticket mutation', expectedRaw, higherRaw, null, { kind: 'save', basket: input }, true],
    ['changed context', expectedRaw, higherRaw, null, { kind: 'begin_checkout', orderId: 'ORD-CONTEXT' }, false],
  ]
  for (const [label, expected, actual, reset, action, current] of cases) {
    let raw = actual, writes = 0
    const storage = { getItem: key => key === COUNTER_TICKETS_KEY ? raw : reset,
      setItem: (_key, value) => { writes++; raw = value } }
    const locks = { request: async (_name, _options, callback) => callback() }
    await assert.rejects(mutateCounterTickets(storage, locks, expected, null, action, () => current),
      error => error?.code !== 'counter_ticket_stale_prewrite', label)
    assert.equal(writes, 0, label)
    assert.equal(raw, actual, label)
  }
})

test('unreadable storage, failed lock, unknown exception and unconfirmed save stay generic', async () => {
  const expectedRaw = JSON.stringify(saved())
  const action = { kind: 'begin_checkout', orderId: 'ORD-UNCERTAIN' }
  for (const [label, storage, locks] of [
    ['unreadable storage', { getItem: () => { throw new Error('unreadable') }, setItem: () => { throw new Error('unexpected write') } },
      { request: async (_name, _options, callback) => callback() }],
    ['failed lock', { getItem: key => key === COUNTER_TICKETS_KEY ? expectedRaw : null, setItem: () => { throw new Error('unexpected write') } },
      { request: async () => { throw new Error('lock unavailable') } }],
    ['unknown thrown value', { getItem: key => key === COUNTER_TICKETS_KEY ? expectedRaw : null, setItem: () => { throw new Error('unexpected write') } },
      { request: async () => { throw 'unknown lock failure' } }],
  ]) {
    await assert.rejects(mutateCounterTickets(storage, locks, expectedRaw, null, action),
      error => error?.code !== 'counter_ticket_stale_prewrite', label)
  }
  let raw = expectedRaw, writes = 0, unconfirmed = false
  const storage = { getItem: key => key === COUNTER_TICKETS_KEY ? unconfirmed ? null : raw : null,
    setItem: (_key, value) => { writes++; raw = value; unconfirmed = true } }
  const locks = { request: async (_name, _options, callback) => callback() }
  const session = createCounterTicketSession(storage, locks)
  const beforeCommit = actualBeforeCommit(session, true, session.getSnapshot().state.revision)
  assert.equal(await beforeCommit('ORD-UNCERTAIN'), false)
  assert.equal(session.getSnapshot().prewriteFailure, null)
  assert.equal(session.getSnapshot().blocked, true)
  assert.equal(writes, 1)
  assert.equal(parseCounterTickets(raw).checkoutOrderId, 'ORD-UNCERTAIN')
})

test('unavailable lock and previously secured command cannot claim a fresh no-sale outcome', async () => {
  let raw = JSON.stringify(saved())
  const storage = { getItem: key => key === COUNTER_TICKETS_KEY ? raw : null, setItem: (_key, value) => { raw = value } }
  const unavailable = createCounterTicketSession(storage, null)
  assert.equal(await actualBeforeCommit(unavailable, true, unavailable.getSnapshot().state.revision)('ORD-NOLOCK'), false)
  assert.equal(unavailable.getSnapshot().prewriteFailure, null)
  const locks = { request: async (_name, _options, callback) => callback() }
  const session = createCounterTicketSession(storage, locks)
  const beforeCommit = actualBeforeCommit(session, true, session.getSnapshot().state.revision)
  assert.equal(await beforeCommit('ORD-SECURED'), true)
  raw = JSON.stringify(transitionCounterTickets(parseCounterTickets(raw), { kind: 'resolve_checkout', orderId: 'ORD-SECURED' }))
  assert.equal(await beforeCommit('ORD-SECURED'), false)
  assert.equal(session.getSnapshot().prewriteFailure, null)
})

test('a dependency-thrown lookalike typed error never authorizes precise cashier wording', async () => {
  for (const origin of ['lock', 'storage']) {
    let raw = JSON.stringify(saved()), unreadable = false, writes = 0
    const storage = {
      getItem: key => {
        if (unreadable) throw new ticketModule.CounterTicketStalePrewriteError()
        return key === COUNTER_TICKETS_KEY ? raw : null
      },
      setItem: (_key, value) => { writes++; raw = value },
    }
    const locks = { request: async (_name, _options, callback) => {
      if (origin === 'lock') throw new ticketModule.CounterTicketStalePrewriteError()
      return callback()
    } }
    const session = createCounterTicketSession(storage, locks)
    const beforeCommit = actualBeforeCommit(session, true, session.getSnapshot().state.revision)
    unreadable = origin === 'storage'
    assert.equal(await beforeCommit(`ORD-${origin}`), false, origin)
    assert.equal(session.getSnapshot().prewriteFailure, null, origin)
    assert.equal(session.getSnapshot().blocked, true, origin)
    assert.equal(writes, 0, origin)
  }
})

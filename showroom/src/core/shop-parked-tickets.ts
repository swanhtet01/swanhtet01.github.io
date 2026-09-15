// Local-only unfinished work. No commerce reducer, stock reservation or payment call.
export const COUNTER_TICKETS_KEY = 'supermega.shop.counter_draft.v1'
const RESET_KEY = 'supermega.shop.order_draft_reset.v1'
const SCHEMA = 'supermega.shop.counter_tickets.v2'
const LIMIT_BYTES = 65_536
export type CounterBasket = { cart: Record<string, number>; customer: string; payment: string; outcome: 'paid_handoff' | 'open_order' }
export type ParkedTicket = CounterBasket & { id: string; label: string }
export type CounterTickets = CounterBasket & { schema: typeof SCHEMA; revision: number; parked: ParkedTicket[]; activeLabel: string; checkoutOrderId: string | null }
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void }
type Locks = { request<T>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<T>): Promise<T> }
export const emptyCounterBasket = (): CounterBasket => ({ cart: {}, customer: '', payment: 'Cash', outcome: 'paid_handoff' })

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function fail(): never { throw new Error('Counter recovery is invalid. Existing data was not replaced.') }
function basket(value: unknown): CounterBasket {
  if (!record(value) || !record(value.cart) || Object.keys(value.cart).length > 100
    || typeof value.customer !== 'string' || value.customer.length > 120
    || !['Cash', 'KBZPay', 'WavePay', 'AYA Pay', 'MMQR', 'Card', 'Cash on delivery'].includes(String(value.payment))
    || !['paid_handoff', 'open_order'].includes(String(value.outcome))) return fail()
  for (const [sku, quantity] of Object.entries(value.cart)) {
    if (!sku || sku.length > 160 || ['__proto__', 'constructor', 'prototype'].includes(sku)
      || !Number.isSafeInteger(quantity) || Number(quantity) < 1 || Number(quantity) > 9999) return fail()
  }
  return { cart: { ...value.cart } as Record<string, number>, customer: value.customer, payment: String(value.payment), outcome: value.outcome as CounterBasket['outcome'] }
}

export function parseCounterTickets(raw: string | null): CounterTickets {
  if (raw === null) return { ...emptyCounterBasket(), schema: SCHEMA, revision: 0, parked: [], activeLabel: '', checkoutOrderId: null }
  if (new TextEncoder().encode(raw).length > LIMIT_BYTES) return fail()
  let source: unknown
  try { source = JSON.parse(raw) } catch { return fail() }
  if (!record(source)) return fail()
  // Existing v1 carts remain readable and are migrated only by an explicit mutation.
  if (source.schema === undefined) {
    if (Object.keys(source).some(key => !['cart', 'customer', 'payment', 'outcome'].includes(key))) return fail()
    return { ...basket({ ...source, outcome: source.outcome ?? 'paid_handoff' }), schema: SCHEMA, revision: 0, parked: [], activeLabel: '', checkoutOrderId: null }
  }
  if (source.schema !== SCHEMA || !Number.isSafeInteger(source.revision) || Number(source.revision) < 1
    || !Array.isArray(source.parked) || source.parked.length > 24
    || Object.keys(source).some(key => !['schema', 'revision', 'parked', 'cart', 'customer', 'payment', 'outcome', 'activeLabel', 'checkoutOrderId'].includes(key))) return fail()
  const checkoutOrderId = source.checkoutOrderId ?? null
  if (checkoutOrderId !== null && (typeof checkoutOrderId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(checkoutOrderId))) return fail()
  const activeLabel = source.activeLabel ?? ''
  if (typeof activeLabel !== 'string' || activeLabel.length > 40 || activeLabel !== activeLabel.trim()) return fail()
  const parked = source.parked.map((value): ParkedTicket => {
    if (!record(value) || typeof value.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(value.id)
      || typeof value.label !== 'string' || !value.label.trim() || value.label !== value.label.trim() || value.label.length > 40
      || Object.keys(value).some(key => !['id', 'label', 'cart', 'customer', 'payment', 'outcome'].includes(key))) return fail()
    const input = basket(value)
    if (!Object.keys(input.cart).length) return fail()
    return { ...input, id: value.id, label: value.label }
  })
  if (new Set(parked.map(ticket => ticket.id)).size !== parked.length
    || new Set(parked.map(ticket => ticket.label.toLowerCase())).size !== parked.length) return fail()
  return { ...basket(source), schema: SCHEMA, revision: Number(source.revision), parked, activeLabel, checkoutOrderId }
}

export type CounterTicketAction = { kind: 'save'; basket: CounterBasket }
  | { kind: 'park'; id: string; label: string }
  | { kind: 'resume'; id: string }
  | { kind: 'begin_checkout'; orderId: string }
  | { kind: 'resolve_checkout'; orderId: string }

export function transitionCounterTickets(current: CounterTickets, action: CounterTicketAction): CounterTickets {
  // Validate every supplied snapshot; callers cannot bypass the parser via a type cast.
  const verified = current.revision === 0 && current.parked.length === 0
    ? { ...basket(current), schema: SCHEMA, revision: 0, parked: [], activeLabel: '', checkoutOrderId: null } : parseCounterTickets(JSON.stringify(current))
  if (verified.checkoutOrderId && action.kind !== 'resolve_checkout') throw new Error('This basket has a checkout recovery reference. Reconcile the recorded order before continuing.')
  if (verified.revision >= Number.MAX_SAFE_INTEGER) throw new Error('Counter revision cannot advance safely.')
  let next: CounterTickets = { ...verified, schema: SCHEMA, revision: verified.revision + 1, parked: [...verified.parked] }
  if (action.kind === 'begin_checkout') {
    if (!Object.keys(verified.cart).length) throw new Error('An empty basket cannot begin checkout.')
    next.checkoutOrderId = action.orderId
  } else if (action.kind === 'resolve_checkout') {
    if (!verified.checkoutOrderId || verified.checkoutOrderId !== action.orderId) throw new Error('Checkout recovery reference does not match.')
    next = { ...next, ...emptyCounterBasket(), activeLabel: '', checkoutOrderId: null }
  } else if (action.kind === 'save') next = { ...next, ...basket(action.basket), activeLabel: Object.keys(action.basket.cart).length ? verified.activeLabel : '' }
  else if (action.kind === 'park') {
    if (!Object.keys(verified.cart).length) throw new Error('Add an item before parking this ticket.')
    next = { ...next, ...emptyCounterBasket(), activeLabel: '', parked: [...verified.parked, { ...basket(verified), id: action.id, label: action.label.trim() }] }
  } else if (action.kind === 'resume') {
    if (Object.keys(verified.cart).length) throw new Error('Park or clear the current basket before resuming another ticket.')
    const ticket = verified.parked.find(candidate => candidate.id === action.id)
    if (!ticket) throw new Error('That ticket changed. Reload the ticket list.')
    next = { ...next, ...basket(ticket), activeLabel: ticket.label, parked: verified.parked.filter(candidate => candidate.id !== action.id) }
  } else return fail()
  return parseCounterTickets(JSON.stringify(next))
}

export async function mutateCounterTickets(storage: Storage, locks: Locks, expectedRaw: string | null, expectedReset: string | null, action: CounterTicketAction, stillCurrent = () => true): Promise<{ raw: string; state: CounterTickets }> {
  if (expectedReset !== null && (!/^(0|[1-9][0-9]*)$/.test(expectedReset) || !Number.isSafeInteger(Number(expectedReset)))) {
    throw new Error('Counter reset marker is invalid. Review recovery before continuing.')
  }
  // Freeze the reviewed transition before waiting for a lock; callers may edit their inputs.
  const next = transitionCounterTickets(parseCounterTickets(expectedRaw), action)
  const raw = JSON.stringify(next)
  return locks.request('supermega:shop:order-draft:reset', { mode: 'exclusive' }, async () => {
    if (!stillCurrent()) throw new Error('Counter context changed. Reload recovery before continuing.')
    if (storage.getItem(RESET_KEY) !== expectedReset || storage.getItem(COUNTER_TICKETS_KEY) !== expectedRaw) {
      throw new Error('Counter recovery changed or was reset. Review it before trying again.')
    }
    // One key write atomically moves the basket into/out of parked work. Never clear first.
    storage.setItem(COUNTER_TICKETS_KEY, raw)
    if (storage.getItem(COUNTER_TICKETS_KEY) !== raw) throw new Error('Counter save could not be confirmed. Reload before continuing.')
    return { raw, state: next }
  })
}

// Event-driven serial persistence. No mount/autosave effect and no silent recovery reset.
export function createCounterTicketSession(storage: Storage | null, locks: Locks | null, initialCustomer = '') {
  let raw: string | null = null, reset: string | null = null, alive = true, failed = false
  let snapshot = { state: parseCounterTickets(null), pending: 0, error: '', blocked: false }
  let tail: Promise<void> = Promise.resolve()
  const listeners = new Set<() => void>()
  const publish = () => { for (const listener of listeners) listener() }
  try {
    if (storage) {
      raw = storage.getItem(COUNTER_TICKETS_KEY)
      reset = storage.getItem(RESET_KEY)
      snapshot.state = parseCounterTickets(raw)
      if (!locks) throw new Error('This browser cannot safely save Counter tickets. Use a supported secure browser.')
    }
    if (!raw) snapshot.state.customer = initialCustomer
  } catch {
    failed = true
    snapshot = { ...snapshot, blocked: true, error: 'Counter recovery could not be opened safely. Existing storage was not replaced. Reload after checking this browser.' }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    activate: () => { alive = true },
    deactivate: () => { alive = false },
    dispatch(action: CounterTicketAction) {
      if (!alive || failed) return false
      let next: CounterTickets, frozen: CounterTicketAction
      try {
        frozen = structuredClone(action)
        next = transitionCounterTickets(snapshot.state, frozen)
      } catch (error) {
        snapshot = { ...snapshot, error: error instanceof Error ? error.message : 'Review this ticket before continuing.' }
        publish(); return false
      }
      snapshot = { state: next, pending: snapshot.pending + (storage ? 1 : 0), error: '', blocked: false }
      publish()
      if (storage && locks) tail = tail.then(async () => {
        try {
          if (failed || !alive) throw new Error('Counter session changed.')
          const result = await mutateCounterTickets(storage, locks, raw, reset, frozen, () => alive && !failed)
          raw = result.raw
        } catch {
          failed = true
          snapshot = { ...snapshot, blocked: true, error: 'Counter save is unconfirmed or changed in another tab. Do not repeat the sale. Reload to reconcile saved tickets.' }
        } finally {
          snapshot = { ...snapshot, pending: snapshot.pending - 1 }
          publish()
        }
      })
      return true
    },
    checkpoint(confirmedCheckoutId?: string) {
      if (!alive || failed || snapshot.pending) return false
      if (snapshot.state.checkoutOrderId && snapshot.state.checkoutOrderId !== confirmedCheckoutId) return false
      try {
        if (storage && (storage.getItem(COUNTER_TICKETS_KEY) !== raw || storage.getItem(RESET_KEY) !== reset)) throw new Error('changed')
        return true
      } catch {
        failed = true
        snapshot = { ...snapshot, blocked: true, error: 'Counter recovery changed. Reload before reviewing a sale.' }
        publish(); return false
      }
    },
    settled: () => tail,
  }
}

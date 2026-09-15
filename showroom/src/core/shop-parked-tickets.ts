// Local-only unfinished work. No commerce reducer, stock reservation or payment call.
export const COUNTER_TICKETS_KEY = 'supermega.shop.counter_draft.v1'
const RESET_KEY = 'supermega.shop.order_draft_reset.v1'
const SCHEMA = 'supermega.shop.counter_tickets.v2'
const LIMIT_BYTES = 65_536
export type CounterBasket = { cart: Record<string, number>; customer: string; payment: string; outcome: 'paid_handoff' | 'open_order' }
export type ParkedTicket = CounterBasket & { id: string; label: string }
export type CounterTickets = CounterBasket & { schema: typeof SCHEMA; revision: number; parked: ParkedTicket[] }
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
  if (raw === null) return { ...emptyCounterBasket(), schema: SCHEMA, revision: 0, parked: [] }
  if (new TextEncoder().encode(raw).length > LIMIT_BYTES) return fail()
  let source: unknown
  try { source = JSON.parse(raw) } catch { return fail() }
  if (!record(source)) return fail()
  // Existing v1 carts remain readable and are migrated only by an explicit mutation.
  if (source.schema === undefined) {
    if (Object.keys(source).some(key => !['cart', 'customer', 'payment', 'outcome'].includes(key))) return fail()
    return { ...basket({ ...source, outcome: source.outcome ?? 'paid_handoff' }), schema: SCHEMA, revision: 0, parked: [] }
  }
  if (source.schema !== SCHEMA || !Number.isSafeInteger(source.revision) || Number(source.revision) < 1
    || !Array.isArray(source.parked) || source.parked.length > 24
    || Object.keys(source).some(key => !['schema', 'revision', 'parked', 'cart', 'customer', 'payment', 'outcome'].includes(key))) return fail()
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
  return { ...basket(source), schema: SCHEMA, revision: Number(source.revision), parked }
}

export type CounterTicketAction = { kind: 'save'; basket: CounterBasket }
  | { kind: 'park'; id: string; label: string }
  | { kind: 'resume'; id: string }

export function transitionCounterTickets(current: CounterTickets, action: CounterTicketAction): CounterTickets {
  // Validate every supplied snapshot; callers cannot bypass the parser via a type cast.
  const verified = current.revision === 0 && current.parked.length === 0
    ? { ...basket(current), schema: SCHEMA, revision: 0, parked: [] } : parseCounterTickets(JSON.stringify(current))
  if (verified.revision >= Number.MAX_SAFE_INTEGER) throw new Error('Counter revision cannot advance safely.')
  let next: CounterTickets = { ...verified, schema: SCHEMA, revision: verified.revision + 1, parked: [...verified.parked] }
  if (action.kind === 'save') next = { ...next, ...basket(action.basket) }
  else if (action.kind === 'park') {
    if (!Object.keys(verified.cart).length) throw new Error('Add an item before parking this ticket.')
    next = { ...next, ...emptyCounterBasket(), parked: [...verified.parked, { ...basket(verified), id: action.id, label: action.label.trim() }] }
  } else if (action.kind === 'resume') {
    if (Object.keys(verified.cart).length) throw new Error('Park or clear the current basket before resuming another ticket.')
    const ticket = verified.parked.find(candidate => candidate.id === action.id)
    if (!ticket) throw new Error('That ticket changed. Reload the ticket list.')
    next = { ...next, ...basket(ticket), parked: verified.parked.filter(candidate => candidate.id !== action.id) }
  } else return fail()
  return parseCounterTickets(JSON.stringify(next))
}

export async function mutateCounterTickets(storage: Storage, locks: Locks, expectedRaw: string | null, expectedReset: string | null, action: CounterTicketAction): Promise<{ raw: string; state: CounterTickets }> {
  return locks.request('supermega:shop:order-draft:reset', { mode: 'exclusive' }, async () => {
    if (storage.getItem(RESET_KEY) !== expectedReset || storage.getItem(COUNTER_TICKETS_KEY) !== expectedRaw) {
      throw new Error('Counter recovery changed or was reset. Review it before trying again.')
    }
    const next = transitionCounterTickets(parseCounterTickets(expectedRaw), action)
    const raw = JSON.stringify(next)
    // One key write atomically moves the basket into/out of parked work. Never clear first.
    storage.setItem(COUNTER_TICKETS_KEY, raw)
    if (storage.getItem(COUNTER_TICKETS_KEY) !== raw) throw new Error('Counter save could not be confirmed. Reload before continuing.')
    return { raw, state: next }
  })
}

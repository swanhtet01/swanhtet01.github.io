// Composition guard: a customer message all the way to a reserved Shop order.
//
// Every other guard in this branch tests one stage. This one tests the SEAM, because the
// stages have independent validators and nothing was checking they agree.
//
// The property: anything channelOrderDraftIsReady() accepts must also be acceptable to
// reserveCommerceOrder(). If the two ever disagree -- a SKU shape, a quantity bound, a
// payment label the intake allows and the order path refuses -- an operator finishes
// transcribing a customer's message, hits confirm, and gets a dead end. Neither stage's own
// tests would notice, because each is correct in isolation.
//
// The mapping mirrors useChannelDraft in CoreApp.tsx: customer, channel, sku, quantity and
// payment come from the draft, and fulfilmentReference is the draft's sourceRecordId.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export { buildChannelOrderDraft, channelOrderDraftIsReady } from './channel-order-intake.ts'
      export { createSeedCommerce, reserveCommerceOrder } from './commerce-workspace.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/journey-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { buildChannelOrderDraft, channelOrderDraftIsReady, createSeedCommerce, reserveCommerceOrder } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const OPERATOR = 'Swan Htet'
const state = createSeedCommerce()
const item = state.items.find((candidate) => candidate.onHand > 3)
check(Boolean(item), 'the seed has a sellable item to order against')

const QUANTITY = 2
const MESSAGE = `Ma Thida here. Please send ${QUANTITY} of ${item.sku} and I will pay with KBZPay.`

// --- stage 1: the customer message becomes a ready draft ---------------------
const draft = buildChannelOrderDraft({
  sourceLabel: 'Messenger thread 4471',
  message: MESSAGE,
  channel: 'Messenger',
  customer: 'Ma Thida',
  sku: item.sku,
  quantity: QUANTITY,
  payment: 'KBZPay',
  catalogSkus: state.items.map((entry) => entry.sku),
  attributions: {
    customer: { kind: 'quote', quote: 'Ma Thida' },
    sku: { kind: 'quote', quote: item.sku },
    quantity: { kind: 'quote', quote: `${QUANTITY} of` },
    payment: { kind: 'quote', quote: 'KBZPay' },
  },
})
check(draft.status === 'ready_for_confirmation', `the message produces a ready draft, got ${draft.status} ${JSON.stringify(draft.blockers)}`)
check(channelOrderDraftIsReady(draft), 'and it passes the readiness type guard')

// --- stage 2: the mapping CoreApp performs -----------------------------------
// Deliberately written the way useChannelDraft writes it, so a change there that this file
// does not mirror shows up as a failing composition rather than silently diverging.
const CAPTURED_AT = '2026-07-24T09:00:00.000Z'
const order = {
  id: 'ORD-JOURNEY-1',
  createdAt: CAPTURED_AT,
  customer: draft.customer,
  owner: OPERATOR,
  channel: draft.channel,
  item: item.name,
  itemSku: draft.sku,
  quantity: draft.quantity,
  payment: draft.payment,
  paymentStatus: 'pending',
  refundStatus: 'none',
  fulfilment: 'delivery',
  fulfilmentReference: draft.sourceRecordId,
  promisedAt: '2026-07-24T12:00:00.000Z',
  total: item.price * draft.quantity,
  status: 'confirmed',
  lines: [{ sku: item.sku, name: item.name, variant: item.variant, quantity: draft.quantity, unitPriceMmk: item.price }],
}

check(order.customer === 'Ma Thida', 'the customer carries across the seam')
check(order.itemSku === item.sku, 'the SKU carries across')
check(order.quantity === QUANTITY, 'the quantity carries across')
check(order.payment === 'KBZPay', 'the payment method carries across')
check(
  order.fulfilmentReference === draft.sourceRecordId && /^CHN-/.test(order.fulfilmentReference),
  'and the order is traceable back to the conversation it came from',
)

// --- stage 3: the order path must accept what the channel path produced ------
const reserved = reserveCommerceOrder(state, order, {
  actionId: 'ACT-JOURNEY-1',
  capturedAt: CAPTURED_AT,
  actor: OPERATOR,
  reason: 'Confirmed the Messenger order with the customer',
  evidenceReference: draft.evidenceReference,
  commandId: 'CMD-JOURNEY-1',
})
check(
  reserved !== null,
  'THE SEAM HOLDS: an order built from a ready channel draft is accepted by reserveCommerceOrder',
)

const stored = reserved.orders.find((candidate) => candidate.id === 'ORD-JOURNEY-1')
check(Boolean(stored), 'the order is persisted')
check(stored.total === item.price * QUANTITY, 'priced from the catalog, not from anything the message claimed')
check(Boolean(stored.calculation), 'and carries its calculation for the daily close')
check(
  reserved.items.find((candidate) => candidate.sku === item.sku).onHand === item.onHand - QUANTITY,
  'stock is reduced by exactly the quantity the customer asked for',
)
check(
  stored.fulfilmentReference === draft.sourceRecordId,
  'and the persisted order still names the conversation, so the trail survives the write',
)

// --- the message could not have set the price --------------------------------
// A customer claiming a price in the message must not reach the order. The channel draft
// carries no price at all, and the order is priced from the catalog -- assert that rather
// than assume it, since a future draft field could quietly change it.
check(
  !Object.keys(draft).some((key) => /price|amount|total/i.test(key)),
  'the channel draft carries no price field for a message to influence',
)
check(
  stored.lines[0].unitPriceMmk === item.price,
  'the stored line price is the catalog price',
)

// --- the intake must not let through what the order path would refuse -------
// A single valid fixture cannot detect a RELAXED bound: quantity 2 is acceptable either way,
// so deleting the intake's quantity check changes nothing above. These probe the boundary
// itself -- anything the order path would reject must fail to become ready in the first
// place, so the operator is told at the message, not after transcribing it.
const draftWithQuantity = (quantity) => buildChannelOrderDraft({
  sourceLabel: 'Messenger thread 4471',
  message: `Ma Thida here. Please send some of ${item.sku} and I will pay with KBZPay.`,
  channel: 'Messenger',
  customer: 'Ma Thida',
  sku: item.sku,
  quantity,
  payment: 'KBZPay',
  catalogSkus: state.items.map((entry) => entry.sku),
  attributions: {
    customer: { kind: 'quote', quote: 'Ma Thida' },
    sku: { kind: 'quote', quote: item.sku },
    quantity: { kind: 'operator_supplied' },
    payment: { kind: 'quote', quote: 'KBZPay' },
  },
})

for (const [quantity, label] of [[0, 'zero'], [-1, 'negative'], [1.5, 'fractional'], [10_000, 'beyond the bound']]) {
  const rejected = draftWithQuantity(quantity)
  check(
    !channelOrderDraftIsReady(rejected),
    `a ${label} quantity never becomes a ready draft, so it cannot reach the order path`,
  )
}
check(
  channelOrderDraftIsReady(draftWithQuantity(1)),
  'while a quantity of 1 does -- so the rejections above are the bound, not a broken fixture',
)

console.log(`channel-to-order journey contract: ${checks} checks passed`)

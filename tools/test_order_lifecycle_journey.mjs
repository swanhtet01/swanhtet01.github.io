// Composition guard: the full order lifecycle, reserve to returnable.
//
// The return guard in this branch builds its completed order BY HAND. That proves the return
// rules, but it does not prove that an order the product actually produces satisfies them.
// If reserveCommerceOrder and buildEcommerceReturnIntent ever drift apart -- a field one
// stops writing that the other still requires -- every unit guard stays green while no real
// order in the system can be returned.
//
// So this drives one order through every stage the product does, using only product
// functions: reserve, advance to preparing, advance to ready, reconcile the payment, advance
// to completed, then raise a return against it. Each step's output is the next step's input.
//
// The ordering constraint is real and worth pinning: ready cannot become completed until the
// payment is reconciled. That is the rule that stops a shop handing goods over and losing
// track of whether it was paid.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export {
        createSeedCommerce, reserveCommerceOrder, advanceCommerceOrder, reconcileCommercePayment,
        commerceOrderAcknowledgement, commerceOrderAcknowledgementText,
      } from './commerce-workspace.ts'
      export { buildEcommerceReturnIntent } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/lifecycle-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  createSeedCommerce, reserveCommerceOrder, advanceCommerceOrder, reconcileCommercePayment,
  commerceOrderAcknowledgement, commerceOrderAcknowledgementText,
  buildEcommerceReturnIntent,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const OPERATOR = 'Swan Htet'
const ORDER_ID = 'ORD-LIFECYCLE-1'
const SOURCE_REQUEST = 'ECR-459AAB25-5BDD-4687-BABA-82FD4E6A1578'
const at = (hour) => `2026-07-24T${String(hour).padStart(2, '0')}:00:00.000Z`
const proof = (suffix, hour) => ({
  actionId: `ACT-LIFECYCLE-${suffix}`,
  capturedAt: at(hour),
  actor: OPERATOR,
  reason: `Lifecycle step ${suffix}`,
  evidenceReference: `LIFECYCLE-${suffix}`,
})

const seed = createSeedCommerce()
const item = seed.items.find((candidate) => candidate.onHand > 3)
check(Boolean(item), 'the seed has a sellable item')

const QUANTITY = 2
const orderOf = (state) => state.orders.find((candidate) => candidate.id === ORDER_ID)

// --- reserve ------------------------------------------------------------------
let state = reserveCommerceOrder(seed, {
  id: ORDER_ID,
  createdAt: at(9),
  customer: 'Ma Thida',
  owner: OPERATOR,
  channel: 'Counter',
  item: item.name,
  itemSku: item.sku,
  quantity: QUANTITY,
  payment: 'KBZPay',
  paymentStatus: 'pending',
  refundStatus: 'none',
  fulfilment: 'delivery',
  fulfilmentReference: 'Delivery handoff #1',
  promisedAt: at(18),
  total: item.price * QUANTITY,
  status: 'confirmed',
  lines: [{ sku: item.sku, name: item.name, variant: item.variant, quantity: QUANTITY, unitPriceMmk: item.price }],
}, proof('RESERVE', 9))
check(state !== null, 'the order reserves')
check(orderOf(state).status === 'confirmed', 'and starts confirmed')

// --- ready cannot complete before the payment is reconciled ------------------
let toPreparing = advanceCommerceOrder(state, ORDER_ID, 'confirmed', proof('PREPARING', 10))
check(toPreparing !== null, 'confirmed advances to preparing')
state = toPreparing
check(orderOf(state).status === 'preparing', 'and the status moves')

state = advanceCommerceOrder(state, ORDER_ID, 'preparing', proof('READY', 11))
check(state !== null, 'preparing advances to ready')
check(orderOf(state).status === 'ready', 'and the status moves again')

check(
  advanceCommerceOrder(state, ORDER_ID, 'ready', proof('EARLY-COMPLETE', 12)) === null,
  'a READY order cannot be completed while its payment is still pending -- goods do not leave unpaid',
)
check(orderOf(state).paymentStatus === 'pending', 'and the payment really is still pending, so that refusal is meaningful')

// --- reconcile, then complete ------------------------------------------------
state = reconcileCommercePayment(state, ORDER_ID, proof('RECONCILE', 12))
check(state !== null, 'the payment reconciles')
check(orderOf(state).paymentStatus === 'reconciled', 'and the order records it')

state = advanceCommerceOrder(state, ORDER_ID, 'ready', proof('COMPLETE', 13))
check(state !== null, 'a reconciled ready order completes')
const completed = orderOf(state)
check(completed.status === 'completed', 'and reaches completed')
check(Boolean(completed.completion), 'carrying completion proof, which the return path requires')
check(Boolean(completed.calculation), 'and its calculation, which the daily close requires')

// --- the return path against a REAL completed order --------------------------
// An order carrying sourceRecordId cannot be reserved unless a matching Ecommerce request
// exists in state, and the seed has none -- claiming an order came from a request that does
// not exist is correctly refused. So this lifecycle produces a walk-in Counter order, and
// what that proves is the other half of the attribution rule: the Ecommerce return path must
// REFUSE it, because it is not attributable to any Ecommerce request.
let walkInReturn = null
try {
  walkInReturn = buildEcommerceReturnIntent({
    scope: 'demo', orderSnapshot: completed, sku: item.sku, quantity: 1,
    disposition: 'restock', reason: 'Customer returned one unit unopened',
    idempotencyKey: 'ERI-8CAC808D-92A2-4FE4-89E8-D3C980B0F3C5', createdAt: at(14),
  })
} catch { walkInReturn = 'refused' }
check(
  walkInReturn === 'refused',
  'a completed WALK-IN order is not returnable through the Ecommerce path -- attribution is required, not assumed',
)

// The same order with an Ecommerce attribution grafted on IS accepted, which shows the
// refusal above is about attribution specifically rather than something else the lifecycle
// failed to write. Grafted rather than reserved, because reserving it needs a storefront
// request the seed does not carry -- recorded so this is not mistaken for a full path test.
const attributed = { ...completed, sourceRecordId: SOURCE_REQUEST }
const intent = buildEcommerceReturnIntent({
  scope: 'demo', orderSnapshot: attributed, sku: item.sku, quantity: 1,
  disposition: 'restock', reason: 'Customer returned one unit unopened',
  idempotencyKey: 'ERI-8CAC808D-92A2-4FE4-89E8-D3C980B0F3C5', createdAt: at(14),
})
check(
  Boolean(intent),
  'THE SEAM HOLDS: everything else the lifecycle wrote -- completion proof, lines, quantities -- satisfies the return path',
)
check(intent.orderId === ORDER_ID, 'the return names that order')
check(intent.quantity === 1, 'for the quantity being returned')

let overReturn = null
try {
  overReturn = buildEcommerceReturnIntent({
    scope: 'demo', orderSnapshot: attributed, sku: item.sku, quantity: QUANTITY + 1,
    disposition: 'restock', reason: 'Returning more than was ever sold',
    idempotencyKey: 'ERI-1D2E3F40-5A6B-4C7D-8E9F-A0B1C2D3E4F5', createdAt: at(14),
  })
} catch { overReturn = 'refused' }
check(overReturn === 'refused', `returning more than the ${QUANTITY} actually sold is refused, using the quantity the LIFECYCLE wrote`)

// --- stock moved exactly once ------------------------------------------------
check(
  state.items.find((candidate) => candidate.sku === item.sku).onHand === item.onHand - QUANTITY,
  'stock fell by the order quantity exactly once across the whole lifecycle, not once per stage',
)


// --- the document the customer is handed, and what it cost to keep it standing by --------
//
// The lifecycle above produced a real completed order through product functions only. This
// is the file the Shop screen hands its customer for that order, and what the screen used to
// pay to have it ready for an order nobody asked to download.
//
// orderAcknowledgementDownload built a percent-encoded `data:text/plain` URL for EVERY order
// in the workspace, inside a useMemo keyed on `commerce`. `commerce` is a new object after
// every sale, so every sale rebuilt every one of them, and all of them stayed alive for the
// life of the page. Measured against a Shop driven to its enforced 2 MiB ceiling: 1,453
// orders, 1,332,424 bytes of acknowledgement text, 1,852,602 bytes of data: URL. It is now
// built inside the click, onto a Blob, through the one helper that revokes -- the pattern
// #535 established on the settings page.
//
// Two guards, different in kind. The first is arithmetic over the real artifact and can never
// be flaky: what the eager form COST, derived rather than written down. The second is
// identity: the customer's file did not change. Timing is deliberately not asserted -- a
// millisecond threshold on a shared CI runner is a guard that cries wolf.
const { readFile } = await import('node:fs/promises')
const encodedBytes = (text) => new TextEncoder().encode(text).byteLength
const corePage = await readFile(new URL('../showroom/src/core/CoreApp.tsx', import.meta.url), 'utf8')

const acknowledgement = commerceOrderAcknowledgement(state, ORDER_ID)
check(Boolean(acknowledgement), 'the order this lifecycle completed must produce an acknowledgement, or there is no file to weigh')

// Exactly what CoreApp.tsx built on the render path before this change, kept here so the cost
// it carried stays measurable after the code that carried it is gone.
const PREFIX = 'data:text/plain;charset=utf-8,'
const eager = `${PREFIX}${encodeURIComponent(`﻿${commerceOrderAcknowledgementText(acknowledgement)}`)}`
// What a browser would have written to disk from the old href.
const fromDataUrl = decodeURIComponent(eager.slice(PREFIX.length))

// What the Blob the click handler now mints carries -- produced by the SHIPPING function,
// lifted out of the page source and RUN, not by a copy of it written here. A copy would make
// this agree with itself rather than with the product: dropping the BOM from
// orderAcknowledgementFileText would leave a hand-written twin passing while the customer's
// Burmese name arrived as mojibake. A Blob of a string is its UTF-8, so what this returns is
// the byte sequence that lands on her disk.
const declaration = corePage.match(/\nfunction orderAcknowledgementFileText\(artifact: CommerceOrderAcknowledgement\) \{\r?\n([\s\S]*?)\r?\n\}/)
check(Boolean(declaration), 'orderAcknowledgementFileText is gone from CoreApp.tsx, so what the download writes can no longer be weighed here')
const fromBlob = new Function('artifact', 'commerceOrderAcknowledgementText', declaration[1])(acknowledgement, commerceOrderAcknowledgementText)
check(fromBlob === fromDataUrl, 'the acknowledgement file changed content when its download stopped being eager')
check(encodedBytes(fromBlob) === encodedBytes(fromDataUrl), 'the acknowledgement file changed size when its download stopped being eager')

// A BOM, and it must stay one. This file is opened by whatever the customer has, and without
// the mark a Burmese customer or product name is mojibake. It is the OPPOSITE call from the
// workspace backup on the settings page, which must NOT carry one because loadBackupFile
// JSON.parses it back and a BOM is not JSON. Two files, two answers; copying either rule to
// the other is a real bug, so each is pinned where its own file is built.
check(fromBlob.startsWith('﻿'), 'the byte-order mark was dropped from the acknowledgement -- a spreadsheet or Notepad renders Burmese names as mojibake without it')
check(!fromBlob.slice(1).includes('﻿'), 'the acknowledgement carries more than one byte-order mark')

// The overhead the eager form paid, asserted as a floor rather than a figure: if percent
// encoding ever got cheap the argument for this change would need redoing.
const overhead = encodedBytes(eager) / encodedBytes(fromBlob)
check(overhead > 1.2, `a data: URL of this file now costs only ${overhead.toFixed(3)}x -- the reason this download stopped being eager no longer holds and the comment on it is stale`)

// --- and it is built on the click, not on the render path -------------------------------
check(!corePage.includes('data:text/plain'), 'the acknowledgement download is building a data: URL again -- one per order, on a memo keyed on commerce, so every sale rebuilds all of them')
check(!corePage.includes('href={acknowledgement.href}'), 'the acknowledgement control is back on a prebuilt href')
const mapMemoStart = corePage.indexOf('const orderAcknowledgementDownloads = useMemo(')
const mapMemo = mapMemoStart < 0 ? '' : corePage.slice(mapMemoStart, corePage.indexOf('const [receiptAck, setReceiptAck]', mapMemoStart))
check(Boolean(mapMemo), 'the per-order acknowledgement map is gone, so what it costs can no longer be weighed here')
check(!mapMemo.includes('encodeURIComponent('), 'the per-order map is percent-encoding a file again on the render path')

// Trading a retained data: URL for an object URL that is never revoked would pin the same
// bytes and this change would have bought nothing.
const helper = await readFile(new URL('../showroom/src/core/download-file.ts', import.meta.url), 'utf8')
check(
  /export function downloadBlob\(filename: string, blob: Blob\) \{[\s\S]*?URL\.revokeObjectURL\(url\)/.test(helper),
  'the shared download helper no longer revokes what it mints -- an object URL never released pins its whole buffer for the life of the page',
)
const actionsStart = corePage.indexOf('function OrderReceiptActions(')
const actions = actionsStart < 0 ? '' : corePage.slice(actionsStart, corePage.indexOf('function OrderList(', actionsStart))
check(
  actions.includes('downloadBlob(acknowledgement.filename, new Blob([orderAcknowledgementFileText(acknowledgement.artifact)]'),
  'the acknowledgement download no longer mints its file as a Blob on the click',
)
check(!actions.includes('URL.createObjectURL('), 'the acknowledgement download mints its own object URL again instead of handing off to the helper that revokes')

console.log(`order lifecycle journey contract: ${checks} checks passed`)

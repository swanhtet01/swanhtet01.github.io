// Guard: when the device cannot store a sale, the sale must not appear to have happened.
//
// This is a browser-local POS. The realistic failure on a low-end phone mid-shift is not a
// crash -- it is storage refusing a write because the device is full. The dangerous outcome is
// the interface advancing anyway: the operator hands over goods for a sale that vanishes on
// reload, and stock drifts from the shelf.
//
// Verified by hand first, by making Storage.prototype.setItem throw QuotaExceededError during a
// real counter sale in a browser: the confirmation gate stayed open, the screen kept showing the
// pre-sale stock, stored bytes were identical to before, and the screen offered "Retry same
// confirmation" and "Reload Shop". Restoring storage and retrying completed exactly one order.
//
// This file pins the model-level half of that, across every way a write can fail. The subtle one
// is the READ-BACK: mutateCommerceWorkspace writes, reads the key again, and refuses if the
// value does not match. Some mobile browsers accept setItem in private mode and silently drop
// it, which no exception would reveal.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createSeedCommerce, mutateCommerceWorkspace, reserveCommerceOrder,
    } from './commerce-workspace.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/write-closed-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { createSeedCommerce, mutateCommerceWorkspace, reserveCommerceOrder } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const COMMERCE_KEY = 'supermega.commerce.workspace.v2'
const OPERATOR = 'Swan Htet'

// The real code takes a Web Locks manager; this runs the callback exactly once, like an
// uncontended exclusive lock.
const lockManager = { request: async (_name, _options, callback) => callback() }

const seed = createSeedCommerce()
const item = seed.items.find((candidate) => candidate.onHand > 3)
const baseline = JSON.stringify(seed)

// The transition every case below attempts: one real counter sale.
const sell = (state) => reserveCommerceOrder(state, {
  id: 'ORD-WRITE-CLOSED-1', createdAt: '2026-07-24T09:00:00.000Z', customer: 'Ma Thida',
  owner: OPERATOR, channel: 'Counter', item: item.name, itemSku: item.sku, quantity: 2,
  payment: 'KBZPay', paymentStatus: 'pending', refundStatus: 'none', fulfilment: 'pickup',
  fulfilmentReference: 'Counter handoff', promisedAt: '2026-07-24T18:00:00.000Z',
  total: item.price * 2, status: 'confirmed',
  lines: [{ sku: item.sku, name: item.name, variant: item.variant, quantity: 2, unitPriceMmk: item.price }],
}, {
  actionId: 'ACT-WRITE-CLOSED-1', capturedAt: '2026-07-24T09:00:00.000Z', actor: OPERATOR,
  reason: 'Counter sale during a storage failure', evidenceReference: 'WRITE-CLOSED-1',
})

// Sanity: the transition itself is valid, so every refusal below is about STORAGE and not
// about the sale being rejected on its own merits.
const wouldSucceed = sell(seed)
check(wouldSucceed !== null, 'the sale itself is valid, so the refusals below are about storage')
check(
  wouldSucceed.items.find((candidate) => candidate.sku === item.sku).onHand === item.onHand - 2,
  'and it would move stock if it were stored',
)

function storeThat(behaviour) {
  const map = new Map([[COMMERCE_KEY, baseline]])
  return {
    map,
    getItem: (key) => (behaviour === 'read-throws' ? (() => { throw new Error('blocked') })() : map.get(key) ?? null),
    setItem: (key, value) => {
      if (behaviour === 'quota') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      if (behaviour === 'silently-drops') return
      map.set(key, value)
    },
    removeItem: (key) => { map.delete(key) },
  }
}

// --- every way the device can refuse the sale ---------------------------------
const cases = [
  ['quota', 'the device is out of space and setItem throws'],
  ['silently-drops', 'setItem accepts the write and silently drops it -- private mode on some phones'],
  ['read-throws', 'storage cannot even be read'],
]

for (const [behaviour, description] of cases) {
  const storage = storeThat(behaviour)
  const before = storage.map.get(COMMERCE_KEY)
  const result = await mutateCommerceWorkspace(sell, storage, lockManager)

  check(result.ok === false, `${behaviour}: the sale is refused -- ${description}`)
  check(
    typeof result.error === 'string' && result.error.length > 0,
    `${behaviour}: and says why, got ${JSON.stringify(result.error)}`,
  )
  check(
    !('state' in result) || result.state === undefined,
    `${behaviour}: NO STATE IS HANDED BACK, so no caller can advance on it`,
  )
  check(
    storage.map.get(COMMERCE_KEY) === before,
    `${behaviour}: stored bytes are unchanged -- there is no half-written sale to recover from`,
  )
  check(
    !String(storage.map.get(COMMERCE_KEY) ?? '').includes('ORD-WRITE-CLOSED-1'),
    `${behaviour}: and the order does not appear in storage`,
  )
}

// The read-back check is the one that catches silent drops. Its message must be distinct from
// the thrown-exception case, or an operator cannot tell "device full" from "browser lying".
const quotaResult = await mutateCommerceWorkspace(sell, storeThat('quota'), lockManager)
const dropResult = await mutateCommerceWorkspace(sell, storeThat('silently-drops'), lockManager)
check(
  quotaResult.error !== dropResult.error,
  `a rejected write and an unconfirmed write report differently -- "${quotaResult.error}" vs "${dropResult.error}"`,
)

// --- the environment itself can be missing ------------------------------------
const noStorage = await mutateCommerceWorkspace(sell, undefined, lockManager)
check(noStorage.ok === false, 'with no storage at all the sale is refused rather than assumed')

// Passing `undefined` here would NOT test this: the parameter defaults to
// globalThis.navigator?.locks, which exists in modern Node, so the call would quietly succeed
// and this assertion would be about nothing. An object with no `request` is the faithful
// stand-in for a browser without the Web Locks API.
const noLocks = await mutateCommerceWorkspace(sell, storeThat('ok'), {})
check(
  noLocks.ok === false,
  'without a lock manager the sale is refused -- two tabs must not race on one device',
)

// --- and when storage works, the same sale goes through -----------------------
// Without this the whole file could pass against a function that refused everything.
const working = storeThat('ok')
const success = await mutateCommerceWorkspace(sell, working, lockManager)
check(success.ok === true, `the identical sale succeeds once storage works, got ${success.error ?? ''}`)
check(
  String(working.map.get(COMMERCE_KEY)).includes('ORD-WRITE-CLOSED-1'),
  'and the order reaches storage',
)
const stored = JSON.parse(working.map.get(COMMERCE_KEY))
check(
  stored.items.find((candidate) => candidate.sku === item.sku).onHand === item.onHand - 2,
  'with stock moved exactly once',
)

console.log(`commerce write fails closed contract: ${checks} checks passed`)

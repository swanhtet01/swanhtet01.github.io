import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { decideShopNextAction } from './shop-next-action.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-next-action-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { decideShopNextAction } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function baseline(overrides = {}) {
  return {
    canWrite: true,
    pendingAction: false,
    catalogItemCount: 5,
    pendingOnlineRequestCount: 0,
    actionOrderCount: 0,
    activePurchaseOrderCount: 0,
    lowStockCount: 0,
    inventoryReady: true,
    ...overrides,
  }
}

const VALID_TRACKS = new Set(['Review', 'Orders', 'Inventory', 'Counter'])
function checkDecision(decision, label) {
  check(typeof decision.job === 'string' && decision.job.length > 0, `${label}: job is a non-empty string`)
  check(typeof decision.nextAction === 'string' && decision.nextAction.length > 0, `${label}: nextAction is a non-empty string`)
  check(typeof decision.ownerGate === 'string' && decision.ownerGate.length > 0, `${label}: ownerGate is a non-empty string`)
  check(typeof decision.path === 'string' && decision.path.startsWith('/'), `${label}: path starts with /`)
  check(typeof decision.reason === 'string' && decision.reason.length > 0, `${label}: reason is a non-empty string`)
  check(typeof decision.stage === 'string' && decision.stage.length > 0, `${label}: stage is a non-empty string`)
  check(VALID_TRACKS.has(decision.track), `${label}: track is a valid value (got ${decision.track})`)
}

// 1. canWrite: false → Restore Shop write readiness (highest priority)
{
  const d = decideShopNextAction(baseline({ canWrite: false }))
  checkDecision(d, 'write-blocked')
  check(d.job === 'Restore Shop write readiness', 'write-blocked: job')
  check(d.track === 'Review', 'write-blocked: track is Review')
  check(d.path === '/settings/#controls', 'write-blocked: path to settings')
}

// 2. canWrite false beats pendingAction (priority test)
{
  const d = decideShopNextAction(baseline({ canWrite: false, pendingAction: true }))
  check(d.job === 'Restore Shop write readiness', 'canWrite beats pendingAction')
}

// 3. pendingAction → Approve pending Shop change
{
  const d = decideShopNextAction(baseline({ pendingAction: true }))
  checkDecision(d, 'pending-action')
  check(d.job === 'Approve pending Shop change', 'pending-action: job')
  check(d.track === 'Review', 'pending-action: track is Review')
  check(d.path === '/shop/?tab=orders', 'pending-action: path to orders')
}

// 4. pendingAction beats zero catalog (priority test)
{
  const d = decideShopNextAction(baseline({ pendingAction: true, catalogItemCount: 0 }))
  check(d.job === 'Approve pending Shop change', 'pendingAction beats empty catalog')
}

// 5. catalogItemCount 0 → Import your first products
{
  const d = decideShopNextAction(baseline({ catalogItemCount: 0 }))
  checkDecision(d, 'empty-catalog')
  check(d.job === 'Import your first products', 'empty-catalog: job')
  check(d.track === 'Inventory', 'empty-catalog: track is Inventory')
  check(d.path.includes('shop-catalog-import'), 'empty-catalog: path includes anchor')
}

// 6. empty catalog beats online requests (priority test)
{
  const d = decideShopNextAction(baseline({ catalogItemCount: 0, pendingOnlineRequestCount: 3 }))
  check(d.job === 'Import your first products', 'empty catalog beats online requests')
}

// 7. pendingOnlineRequestCount → Review online order requests
{
  const d = decideShopNextAction(baseline({ pendingOnlineRequestCount: 2 }))
  checkDecision(d, 'online-requests')
  check(d.job === 'Review online order requests', 'online-requests: job')
  check(d.track === 'Orders', 'online-requests: track is Orders')
  check(d.reason.includes('2'), 'online-requests: reason includes count')
}

// 8. online request singular pluralization (1 request)
{
  const d = decideShopNextAction(baseline({ pendingOnlineRequestCount: 1 }))
  check(d.reason.includes('1 online request '), 'online-request singular: reason has "1 online request "')
  check(!d.reason.includes('1 online requests'), 'online-request singular: reason does not have plural')
}

// 9. online request plural (2 requests)
{
  const d = decideShopNextAction(baseline({ pendingOnlineRequestCount: 2 }))
  check(d.reason.includes('2 online requests'), 'online-requests plural: reason has "2 online requests"')
}

// 10. online requests beat action orders (priority test)
{
  const d = decideShopNextAction(baseline({ pendingOnlineRequestCount: 1, actionOrderCount: 5 }))
  check(d.job === 'Review online order requests', 'online requests beat action orders')
}

// 11. actionOrderCount → Finish fulfilment queue
{
  const d = decideShopNextAction(baseline({ actionOrderCount: 3 }))
  checkDecision(d, 'action-orders')
  check(d.job === 'Finish fulfilment queue', 'action-orders: job')
  check(d.track === 'Orders', 'action-orders: track is Orders')
  check(d.reason.includes('3'), 'action-orders: reason includes count')
}

// 12. action order singular (1 order)
{
  const d = decideShopNextAction(baseline({ actionOrderCount: 1 }))
  check(d.reason.includes('1 order '), 'action-order singular: "1 order "')
  check(!d.reason.includes('1 orders'), 'action-order singular: no "1 orders"')
}

// 13. action order plural (2 orders)
{
  const d = decideShopNextAction(baseline({ actionOrderCount: 2 }))
  check(d.reason.includes('2 orders'), 'action-orders plural: "2 orders"')
}

// 14. action orders beat active POs (priority test)
{
  const d = decideShopNextAction(baseline({ actionOrderCount: 1, activePurchaseOrderCount: 5 }))
  check(d.job === 'Finish fulfilment queue', 'action orders beat active POs')
}

// 15. activePurchaseOrderCount → Receive purchase orders
{
  const d = decideShopNextAction(baseline({ activePurchaseOrderCount: 2 }))
  checkDecision(d, 'active-pos')
  check(d.job === 'Receive purchase orders', 'active-pos: job')
  check(d.track === 'Inventory', 'active-pos: track is Inventory')
  check(d.reason.includes('2'), 'active-pos: reason includes count')
}

// 16. active PO singular
{
  const d = decideShopNextAction(baseline({ activePurchaseOrderCount: 1 }))
  check(d.reason.includes('1 purchase order '), 'active-PO singular: "1 purchase order "')
  check(!d.reason.includes('1 purchase orders'), 'active-PO singular: no plural')
}

// 17. active PO plural
{
  const d = decideShopNextAction(baseline({ activePurchaseOrderCount: 3 }))
  check(d.reason.includes('3 purchase orders'), 'active-PO plural: "3 purchase orders"')
}

// 18. active POs beat low stock (priority test)
{
  const d = decideShopNextAction(baseline({ activePurchaseOrderCount: 1, lowStockCount: 10 }))
  check(d.job === 'Receive purchase orders', 'active POs beat low stock')
}

// 19. lowStockCount → Reorder low stock
{
  const d = decideShopNextAction(baseline({ lowStockCount: 4 }))
  checkDecision(d, 'low-stock')
  check(d.job === 'Reorder low stock', 'low-stock: job')
  check(d.track === 'Inventory', 'low-stock: track is Inventory')
  check(d.reason.includes('4'), 'low-stock: reason includes count')
}

// 20. low stock singular SKU
{
  const d = decideShopNextAction(baseline({ lowStockCount: 1 }))
  check(d.reason.includes('1 SKU '), 'low-stock singular: "1 SKU "')
  check(!d.reason.includes('1 SKUs'), 'low-stock singular: no plural')
}

// 21. low stock plural SKUs
{
  const d = decideShopNextAction(baseline({ lowStockCount: 2 }))
  check(d.reason.includes('2 SKUs'), 'low-stock plural: "2 SKUs"')
}

// 22. low stock beats !inventoryReady (priority test)
{
  const d = decideShopNextAction(baseline({ lowStockCount: 1, inventoryReady: false }))
  check(d.job === 'Reorder low stock', 'low stock beats inventory setup')
}

// 23. !inventoryReady → Set up stock locations
{
  const d = decideShopNextAction(baseline({ inventoryReady: false }))
  checkDecision(d, 'inventory-not-ready')
  check(d.job === 'Set up stock locations', 'inventory-not-ready: job')
  check(d.track === 'Inventory', 'inventory-not-ready: track is Inventory')
}

// 24. fully ready → Open counter for next sale
{
  const d = decideShopNextAction(baseline())
  checkDecision(d, 'counter-ready')
  check(d.job === 'Open counter for next sale', 'counter-ready: job')
  check(d.track === 'Counter', 'counter-ready: track is Counter')
  check(d.path === '/shop/?tab=counter', 'counter-ready: path to counter')
}

// 25. zero counts are treated as falsy (fully ready with explicit zeros)
{
  const d = decideShopNextAction({
    canWrite: true, pendingAction: false, catalogItemCount: 10,
    pendingOnlineRequestCount: 0, actionOrderCount: 0,
    activePurchaseOrderCount: 0, lowStockCount: 0, inventoryReady: true,
  })
  check(d.job === 'Open counter for next sale', 'explicit zeros → counter')
}

// 26. negative count throws
{
  let threw = false
  try { decideShopNextAction(baseline({ catalogItemCount: -1 })) }
  catch { threw = true }
  check(threw, 'negative count throws')
}

// 27. non-integer count throws
{
  let threw = false
  try { decideShopNextAction(baseline({ actionOrderCount: 1.5 })) }
  catch { threw = true }
  check(threw, 'non-integer count throws')
}

// 28. NaN count throws
{
  let threw = false
  try { decideShopNextAction(baseline({ lowStockCount: NaN })) }
  catch { threw = true }
  check(threw, 'NaN count throws')
}

// 29. Infinity count throws
{
  let threw = false
  try { decideShopNextAction(baseline({ pendingOnlineRequestCount: Infinity })) }
  catch { threw = true }
  check(threw, 'Infinity count throws')
}

// 30. all decision paths produce a non-empty ownerGate
{
  const paths = [
    baseline({ canWrite: false }),
    baseline({ pendingAction: true }),
    baseline({ catalogItemCount: 0 }),
    baseline({ pendingOnlineRequestCount: 1 }),
    baseline({ actionOrderCount: 1 }),
    baseline({ activePurchaseOrderCount: 1 }),
    baseline({ lowStockCount: 1 }),
    baseline({ inventoryReady: false }),
    baseline(),
  ]
  for (const input of paths) {
    const d = decideShopNextAction(input)
    check(d.ownerGate.length > 10, `ownerGate non-trivial for track=${d.track} job="${d.job}"`)
  }
}

// 31. all paths produce unique jobs
{
  const jobs = [
    baseline({ canWrite: false }),
    baseline({ pendingAction: true }),
    baseline({ catalogItemCount: 0 }),
    baseline({ pendingOnlineRequestCount: 1 }),
    baseline({ actionOrderCount: 1 }),
    baseline({ activePurchaseOrderCount: 1 }),
    baseline({ lowStockCount: 1 }),
    baseline({ inventoryReady: false }),
    baseline(),
  ].map((input) => decideShopNextAction(input).job)
  check(new Set(jobs).size === jobs.length, `all 9 paths produce unique jobs: ${jobs.join(' | ')}`)
}

// 32. canWrite false + zero catalog → still canWrite wins
{
  const d = decideShopNextAction(baseline({ canWrite: false, catalogItemCount: 0, pendingOnlineRequestCount: 5 }))
  check(d.job === 'Restore Shop write readiness', 'canWrite false always wins')
}

// 33. large counts don't overflow reason strings
{
  const d = decideShopNextAction(baseline({ actionOrderCount: 9999 }))
  check(d.reason.includes('9999'), 'large count appears in reason')
  check(d.reason.length < 500, 'reason does not explode for large counts')
}

// 34. catalogItemCount = 1 is non-empty catalog (not treated as zero)
{
  const d = decideShopNextAction(baseline({ catalogItemCount: 1 }))
  check(d.job !== 'Import your first products', 'catalogItemCount 1 is treated as non-empty')
}

// 35. stage is distinct for each path
{
  const stages = [
    baseline({ canWrite: false }),
    baseline({ pendingAction: true }),
    baseline({ catalogItemCount: 0 }),
    baseline({ pendingOnlineRequestCount: 1 }),
    baseline({ actionOrderCount: 1 }),
    baseline({ activePurchaseOrderCount: 1 }),
    baseline({ lowStockCount: 1 }),
    baseline({ inventoryReady: false }),
    baseline(),
  ].map((input) => decideShopNextAction(input).stage)
  check(new Set(stages).size === stages.length, `all 9 paths produce unique stages: ${stages.join(' | ')}`)
}

console.log(`\ntest_shop_next_action: ${checks} checks passed\n`)

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { formatHiddenShopProfitControlPriorities, formatShopProfitControlMetric, projectShopProfitControl } from './shop-profit-control.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-profit-control-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { formatHiddenShopProfitControlPriorities, formatShopProfitControlMetric, projectShopProfitControl } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

function baseline(overrides = {}) {
  return {
    canWrite: true,
    pendingAction: false,
    catalogItemCount: 12,
    incomingRequestCount: 0,
    latePromiseCount: 0,
    paymentPendingCount: 0,
    overdueReceivableCount: 0,
    overdueReceivableMmk: 0,
    refundDueCount: 0,
    lowStockCount: 0,
    closeReadyCount: 0,
    closeReadyMmk: 0,
    ...overrides,
  }
}

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

{
  const board = projectShopProfitControl(baseline())
  check(board.state === 'controlled', 'clear state is controlled')
  check(board.openPriorityCount === 0, 'clear state has zero open priorities')
  check(board.priorities.length === 1 && board.priorities[0].id === 'controlled', 'clear state renders one explicit controlled card')
}

{
  const board = projectShopProfitControl(baseline({ canWrite: false, pendingAction: true, refundDueCount: 2, overdueReceivableCount: 1, overdueReceivableMmk: 75_000 }))
  check(board.state === 'blocked', 'critical controls block the board')
  check(board.openPriorityCount === 4, 'all open priorities are counted, including hidden cards')
  check(board.priorities.map((priority) => priority.id).join(',') === 'record_write_blocked,owner_review_pending,refund_due', 'highest-risk priorities are ordered deterministically')
  check(board.hiddenPriorityCount === 1, 'cards beyond the top three are counted as hidden')
  check(board.criticalPriorityCount === 4, 'critical count covers visible and hidden priorities')
}

{
  const board = projectShopProfitControl(baseline({ catalogItemCount: 0, incomingRequestCount: 2 }))
  check(board.priorities[0].id === 'catalog_missing', 'missing catalog outranks waiting demand')
  check(board.priorities[0].closureCondition.includes('reviewed item'), 'catalog priority carries a measurable closure condition')
}

{
  const board = projectShopProfitControl(baseline({ overdueReceivableCount: 2, overdueReceivableMmk: 125_000, paymentPendingCount: 4 }))
  check(board.openPriorityCount === 1, 'pending payment is not duplicated when overdue receivables already explain the exposure')
  check(board.priorities[0].id === 'overdue_receivable', 'overdue receivable is the money priority')
  check(board.priorities[0].metric.kind === 'money' && board.priorities[0].metric.value === 125_000, 'overdue money remains numeric and exact')
}

{
  const board = projectShopProfitControl(baseline({ latePromiseCount: 1, lowStockCount: 3, incomingRequestCount: 2, closeReadyCount: 4, closeReadyMmk: 210_000 }))
  check(board.state === 'attention', 'non-critical leak signals produce attention state')
  check(board.openPriorityCount === 4, 'all attention/watch priorities are counted')
  check(board.priorities.map((priority) => priority.id).join(',') === 'late_promise,low_stock,incoming_request', 'operating priorities follow the documented order')
  check(board.hiddenPriorityCount === 1, 'close-ready card is retained in hidden count')
}

{
  const board = projectShopProfitControl(baseline({ closeReadyCount: 3, closeReadyMmk: 450_000 }))
  check(board.priorities[0].id === 'close_ready', 'close-ready sales produce a close priority')
  check(board.priorities[0].metric.kind === 'money' && board.priorities[0].metric.value === 450_000, 'close-ready sales retain exact MMK value')
  check(board.priorities[0].target.includes('shop-close-controls'), 'close priority links to close controls')
}

{
  const singularLowStock = projectShopProfitControl(baseline({ lowStockCount: 1 })).priorities[0].metric
  const pluralLowStock = projectShopProfitControl(baseline({ lowStockCount: 2 })).priorities[0].metric
  const singularRefund = projectShopProfitControl(baseline({ refundDueCount: 1 })).priorities[0].metric
  const controlled = projectShopProfitControl(baseline()).priorities[0].metric
  check(formatShopProfitControlMetric(singularLowStock) === '1 low-stock item', 'one low-stock item uses singular copy')
  check(formatShopProfitControlMetric(pluralLowStock) === '2 low-stock items', 'multiple low-stock items use plural copy')
  check(formatShopProfitControlMetric(singularRefund) === '1 due refund', 'one due refund uses singular copy')
  check(formatShopProfitControlMetric(controlled) === '0 open priorities', 'zero count uses plural copy')
  check(formatHiddenShopProfitControlPriorities(1).startsWith('1 lower-priority signal remains visible'), 'one hidden signal uses singular verb')
  check(formatHiddenShopProfitControlPriorities(2).startsWith('2 lower-priority signals remain visible'), 'multiple hidden signals use plural verb')
}

for (const [field, value] of [
  ['catalogItemCount', -1],
  ['incomingRequestCount', 1.5],
  ['latePromiseCount', Number.NaN],
  ['overdueReceivableMmk', -1],
  ['closeReadyMmk', Number.POSITIVE_INFINITY],
]) {
  let threw = false
  try { projectShopProfitControl(baseline({ [field]: value })) } catch { threw = true }
  check(threw, `${field} rejects invalid numeric input`)
}

{
  let threw = false
  try { projectShopProfitControl(baseline({ canWrite: 'yes' })) } catch { threw = true }
  check(threw, 'write gate rejects non-boolean input')
}

console.log(`test_shop_profit_control: ${checks} checks passed`)

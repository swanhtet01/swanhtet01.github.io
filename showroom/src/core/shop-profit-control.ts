export type ShopProfitControlInput = {
  canWrite: boolean
  pendingAction: boolean
  catalogItemCount: number
  incomingRequestCount: number
  latePromiseCount: number
  paymentPendingCount: number
  overdueReceivableCount: number
  overdueReceivableMmk: number
  refundDueCount: number
  lowStockCount: number
  closeReadyCount: number
  closeReadyMmk: number
}

export type ShopProfitControlPriority = {
  id: 'record_write_blocked' | 'owner_review_pending' | 'catalog_missing' | 'refund_due' | 'overdue_receivable' | 'late_promise' | 'payment_pending' | 'low_stock' | 'incoming_request' | 'close_ready' | 'controlled'
  severity: 'critical' | 'attention' | 'watch' | 'clear'
  title: string
  impact: string
  ownerRole: string
  dueLabel: string
  actionLabel: string
  target: string
  closureCondition: string
  metric: {
    kind: 'count'
    label: string
    singularLabel: string
    value: number
  } | {
    kind: 'money'
    label: string
    value: number
  }
}

export type ShopProfitControlBoard = {
  state: 'blocked' | 'attention' | 'controlled'
  openPriorityCount: number
  criticalPriorityCount: number
  priorities: ShopProfitControlPriority[]
  hiddenPriorityCount: number
}

const MAX_VISIBLE_PRIORITIES = 3

function assertSafeCount(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000) throw new Error(`${label} must be a safe non-negative count.`)
}

function assertSafeMoney(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000_000) throw new Error(`${label} must be safe non-negative whole MMK.`)
}

function countMetric(label: string, singularLabel: string, value: number): ShopProfitControlPriority['metric'] {
  return { kind: 'count', label, singularLabel, value }
}

function moneyMetric(label: string, value: number): ShopProfitControlPriority['metric'] {
  return { kind: 'money', label, value }
}

export function formatShopProfitControlMetric(metric: ShopProfitControlPriority['metric']) {
  if (metric.kind === 'money') return `${metric.value.toLocaleString('en-US')} MMK`
  return `${metric.value} ${metric.value === 1 ? metric.singularLabel : metric.label}`
}

export function formatHiddenShopProfitControlPriorities(count: number) {
  assertSafeCount(count, 'Hidden priorities')
  if (!count) return ''
  return `${count} lower-priority signal${count === 1 ? '' : 's'} ${count === 1 ? 'remains' : 'remain'} visible in the linked Shop workspaces. This board shows the top three only.`
}

export function projectShopProfitControl(input: ShopProfitControlInput): ShopProfitControlBoard {
  if (typeof input.canWrite !== 'boolean' || typeof input.pendingAction !== 'boolean') throw new Error('Shop profit-control gates must be boolean.')

  const counts: readonly [number, string][] = [
    [input.catalogItemCount, 'Catalog items'],
    [input.incomingRequestCount, 'Incoming requests'],
    [input.latePromiseCount, 'Late promises'],
    [input.paymentPendingCount, 'Pending payments'],
    [input.overdueReceivableCount, 'Overdue receivables'],
    [input.refundDueCount, 'Due refunds'],
    [input.lowStockCount, 'Low-stock items'],
    [input.closeReadyCount, 'Close-ready orders'],
  ]
  for (const [value, label] of counts) assertSafeCount(value, label)
  assertSafeMoney(input.overdueReceivableMmk, 'Overdue receivable exposure')
  assertSafeMoney(input.closeReadyMmk, 'Close-ready sales')

  const candidates: ShopProfitControlPriority[] = []

  if (!input.canWrite) candidates.push({
    id: 'record_write_blocked',
    severity: 'critical',
    title: 'Restore safe record storage',
    impact: 'Orders and evidence cannot be recorded safely while Shop write readiness is locked.',
    ownerRole: 'Shop owner',
    dueLabel: 'Before the next sale',
    actionLabel: 'Open controls',
    target: '/settings/#controls',
    closureCondition: 'Shop write readiness is verified before another order is recorded.',
    metric: countMetric('locked record paths', 'locked record path', 1),
  })

  if (input.pendingAction) candidates.push({
    id: 'owner_review_pending',
    severity: 'critical',
    title: 'Finish the pending owner review',
    impact: 'A consequential Shop change is waiting for a named human decision.',
    ownerRole: 'Named reviewer',
    dueLabel: 'Now',
    actionLabel: 'Finish review',
    target: '/shop/?tab=orders',
    closureCondition: 'The pending action is explicitly confirmed or cancelled.',
    metric: countMetric('pending reviews', 'pending review', 1),
  })

  if (!input.catalogItemCount) candidates.push({
    id: 'catalog_missing',
    severity: 'critical',
    title: 'Load the first sellable catalog',
    impact: 'Shop cannot measure sales, stock risk, or margin without reviewed items and opening stock.',
    ownerRole: 'Shop owner',
    dueLabel: 'Before pilot day one',
    actionLabel: 'Open catalog',
    target: '/shop/?tab=inventory#shop-catalog-import',
    closureCondition: 'At least one reviewed item exists with price, stock, and reorder evidence.',
    metric: countMetric('catalog items', 'catalog item', 0),
  })

  if (input.refundDueCount) candidates.push({
    id: 'refund_due',
    severity: 'critical',
    title: 'Clear due refund evidence',
    impact: 'Unsettled refunds hide real cash exposure and weaken the daily close.',
    ownerRole: 'Finance reviewer',
    dueLabel: 'Today',
    actionLabel: 'Review returns',
    target: '/shop/?tab=orders#shop-order-history',
    closureCondition: 'Every due refund has externally completed settlement evidence or an explicit refusal.',
    metric: countMetric('due refunds', 'due refund', input.refundDueCount),
  })

  if (input.overdueReceivableCount) candidates.push({
    id: 'overdue_receivable',
    severity: 'critical',
    title: 'Collect overdue customer money',
    impact: `${input.overdueReceivableCount} overdue order${input.overdueReceivableCount === 1 ? '' : 's'} are tying up cash.` ,
    ownerRole: 'Collections owner',
    dueLabel: 'Today',
    actionLabel: 'Open receivables',
    target: '/shop/?tab=orders#shop-order-history',
    closureCondition: 'Overdue receivable exposure reaches zero or each balance has reviewed collection evidence.',
    metric: moneyMetric('overdue', input.overdueReceivableMmk),
  })

  if (input.latePromiseCount) candidates.push({
    id: 'late_promise',
    severity: 'attention',
    title: 'Protect late customer promises',
    impact: 'Late fulfilment increases cancellation, refund, and trust risk.',
    ownerRole: 'Fulfilment owner',
    dueLabel: 'Now',
    actionLabel: 'Open order queue',
    target: '/shop/?tab=orders#shop-order-queue',
    closureCondition: 'No active order remains past its promised time without reviewed exception evidence.',
    metric: countMetric('late promises', 'late promise', input.latePromiseCount),
  })

  if (input.paymentPendingCount && !input.overdueReceivableCount) candidates.push({
    id: 'payment_pending',
    severity: 'attention',
    title: 'Reconcile pending payments',
    impact: 'Completed work without payment evidence can overstate revenue and available cash.',
    ownerRole: 'Cashier / owner',
    dueLabel: 'Before daily close',
    actionLabel: 'Review payments',
    target: '/shop/?tab=orders#shop-order-queue',
    closureCondition: 'Every pending payment has reviewed external evidence or an explicit unpaid state.',
    metric: countMetric('pending payments', 'pending payment', input.paymentPendingCount),
  })

  if (input.lowStockCount) candidates.push({
    id: 'low_stock',
    severity: 'attention',
    title: 'Protect sales from stockout',
    impact: 'Items at or below reorder level can turn current demand into missed sales.',
    ownerRole: 'Stock owner',
    dueLabel: 'Before the next supplier cutoff',
    actionLabel: 'Open reorder queue',
    target: '/shop/?tab=inventory',
    closureCondition: 'Each low-stock item has reviewed replenishment evidence or an explicit no-buy decision.',
    metric: countMetric('low-stock items', 'low-stock item', input.lowStockCount),
  })

  if (input.incomingRequestCount) candidates.push({
    id: 'incoming_request',
    severity: 'watch',
    title: 'Convert waiting demand',
    impact: 'Unreviewed Website and Ecommerce requests are demand that has not become accountable Shop orders.',
    ownerRole: 'Order reviewer',
    dueLabel: 'Within the operating shift',
    actionLabel: 'Open intake',
    target: '/shop/?tab=orders#shop-order-queue',
    closureCondition: 'Every incoming request is accepted into Shop or explicitly declined.',
    metric: countMetric('waiting requests', 'waiting request', input.incomingRequestCount),
  })

  if (input.closeReadyCount) candidates.push({
    id: 'close_ready',
    severity: 'watch',
    title: 'Seal today’s operating result',
    impact: 'Close-ready sales remain provisional until cash, payment, stock, and exception evidence agree.',
    ownerRole: 'Closing operator',
    dueLabel: 'End of day',
    actionLabel: 'Review close',
    target: '/shop/?tab=orders#shop-close-controls',
    closureCondition: 'A reviewed daily close records these orders with balanced settlement evidence.',
    metric: moneyMetric('close-ready sales', input.closeReadyMmk),
  })

  if (!candidates.length) return {
    state: 'controlled',
    openPriorityCount: 0,
    criticalPriorityCount: 0,
    hiddenPriorityCount: 0,
    priorities: [{
      id: 'controlled',
      severity: 'clear',
      title: 'No open profit-control leak',
      impact: 'The monitored order, money, stock, intake, and close signals are currently clear.',
      ownerRole: 'Shop owner',
      dueLabel: 'Keep watching',
      actionLabel: 'Open counter',
      target: '/shop/?tab=counter',
      closureCondition: 'Keep monitored leak metrics at zero through the next reviewed daily close.',
      metric: countMetric('open priorities', 'open priority', 0),
    }],
  }

  const priorities = candidates.slice(0, MAX_VISIBLE_PRIORITIES)
  return {
    state: candidates.some((priority) => priority.severity === 'critical') ? 'blocked' : 'attention',
    openPriorityCount: candidates.length,
    criticalPriorityCount: candidates.filter((priority) => priority.severity === 'critical').length,
    priorities,
    hiddenPriorityCount: candidates.length - priorities.length,
  }
}

import type { CommerceState } from './commerce-workspace.ts'

export type ArAgingBucket = 'current' | '1_7' | '8_30' | '31_60' | 'over_60'

export type ArAgingSummary = {
  asOf: string
  outstandingOrders: number
  totalOutstandingMmk: number
  overdueOrders: number
  overdueMmk: number
  byBucket: Record<ArAgingBucket, { orders: number; totalMmk: number }>
  mostOverdueCustomer: string | undefined
}

const BUCKETS: ArAgingBucket[] = ['current', '1_7', '8_30', '31_60', 'over_60']

function agingBucket(daysPastDue: number): ArAgingBucket {
  if (daysPastDue <= 0) return 'current'
  if (daysPastDue <= 7) return '1_7'
  if (daysPastDue <= 30) return '8_30'
  if (daysPastDue <= 60) return '31_60'
  return 'over_60'
}

export function projectShopArAgingSummary(commerce: CommerceState, asOf: string): ArAgingSummary {
  const asOfMs = Date.parse(asOf)
  type Row = { daysPastDue: number; totalMmk: number; bucket: ArAgingBucket; customer: string }
  const rows: Row[] = commerce.orders.flatMap((order) => {
    if (order.status === 'cancelled' || order.paymentStatus !== 'pending') return []
    const dueAt = order.paymentDueAt ?? order.promisedAt ?? order.createdAt
    const dueMs = Date.parse(dueAt)
    if (!Number.isFinite(dueMs) || !Number.isFinite(asOfMs)) return []
    const daysPastDue = asOfMs > dueMs ? Math.ceil((asOfMs - dueMs) / 86_400_000) : 0
    return [{ daysPastDue, totalMmk: order.total, bucket: agingBucket(daysPastDue), customer: order.customer }]
  })
  const byBucket = Object.fromEntries(
    BUCKETS.map((b) => {
      const matching = rows.filter((r) => r.bucket === b)
      return [b, { orders: matching.length, totalMmk: matching.reduce((sum, r) => sum + r.totalMmk, 0) }]
    }),
  ) as Record<ArAgingBucket, { orders: number; totalMmk: number }>
  const overdueRows = rows.filter((r) => r.daysPastDue > 0)
  const mostOverdueRow = overdueRows.length > 0
    ? [...overdueRows].sort((a, b) => b.daysPastDue - a.daysPastDue || b.totalMmk - a.totalMmk)[0]
    : undefined
  return {
    asOf,
    outstandingOrders: rows.length,
    totalOutstandingMmk: rows.reduce((sum, r) => sum + r.totalMmk, 0),
    overdueOrders: overdueRows.length,
    overdueMmk: overdueRows.reduce((sum, r) => sum + r.totalMmk, 0),
    byBucket,
    mostOverdueCustomer: mostOverdueRow?.customer,
  }
}

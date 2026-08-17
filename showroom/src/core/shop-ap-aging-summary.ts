import type { CommerceState } from './commerce-workspace.ts'

export type ApAgingBucket = 'overdue' | 'due_7_days' | 'scheduled'

export type ApAgingSummary = {
  asOf: string
  totalInvoices: number
  pendingReviewInvoices: number
  readyInvoices: number
  overdueInvoices: number
  dueWithin7DaysInvoices: number
  totalPayableMmk: number
  overduePayableMmk: number
  byBucket: Record<ApAgingBucket, { invoices: number; totalMmk: number }>
  mostOverdueSupplier: string | undefined
}

const AP_BUCKETS: ApAgingBucket[] = ['overdue', 'due_7_days', 'scheduled']

export function projectShopApAgingSummary(commerce: CommerceState, asOf: string): ApAgingSummary {
  const asOfMs = Date.parse(asOf)
  type Row = { supplier: string; daysPastDue: number; totalMmk: number; bucket: ApAgingBucket }
  let pendingReviewInvoices = 0
  const rows: Row[] = (commerce.purchaseOrders ?? []).flatMap((po) => {
    if (po.cancellation) return []
    const invoice = po.supplierInvoice
    if (!invoice) return []
    if (!invoice.payableReview) { pendingReviewInvoices += 1; return [] }
    const dueMs = Date.parse(invoice.dueAt)
    if (!Number.isFinite(dueMs) || !Number.isFinite(asOfMs)) return []
    const daysPastDue = asOfMs > dueMs ? Math.ceil((asOfMs - dueMs) / 86_400_000) : 0
    const daysUntilDue = asOfMs < dueMs ? Math.ceil((dueMs - asOfMs) / 86_400_000) : 0
    const bucket: ApAgingBucket = daysPastDue > 0 ? 'overdue' : daysUntilDue <= 7 ? 'due_7_days' : 'scheduled'
    return [{ supplier: po.supplier, daysPastDue, totalMmk: invoice.totalMmk, bucket }]
  })
  const byBucket = Object.fromEntries(
    AP_BUCKETS.map((b) => {
      const matching = rows.filter((r) => r.bucket === b)
      return [b, { invoices: matching.length, totalMmk: matching.reduce((sum, r) => sum + r.totalMmk, 0) }]
    }),
  ) as Record<ApAgingBucket, { invoices: number; totalMmk: number }>
  const overdueRows = rows.filter((r) => r.bucket === 'overdue')
  const mostOverdueRow = overdueRows.length > 0
    ? [...overdueRows].sort((a, b) => b.daysPastDue - a.daysPastDue || b.totalMmk - a.totalMmk)[0]
    : undefined
  return {
    asOf,
    totalInvoices: rows.length + pendingReviewInvoices,
    pendingReviewInvoices,
    readyInvoices: rows.length,
    overdueInvoices: byBucket.overdue.invoices,
    dueWithin7DaysInvoices: byBucket.due_7_days.invoices,
    totalPayableMmk: rows.reduce((sum, r) => sum + r.totalMmk, 0),
    overduePayableMmk: byBucket.overdue.totalMmk,
    byBucket,
    mostOverdueSupplier: mostOverdueRow?.supplier,
  }
}

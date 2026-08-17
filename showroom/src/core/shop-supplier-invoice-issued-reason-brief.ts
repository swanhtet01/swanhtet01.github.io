import type { CommerceState } from './commerce-workspace.ts'

export type ShopSupplierInvoiceIssuedReasonBrief = {
  totalInvoices: number
  earliestIssuedAt: string | null
  latestIssuedAt: string | null
  uniqueRecordingReasons: number
  topRecordingReasonsByCount: Array<{ reason: string; count: number }>
}

export function projectShopSupplierInvoiceIssuedReasonBrief(
  commerce: CommerceState,
): ShopSupplierInvoiceIssuedReasonBrief {
  let totalInvoices = 0
  let earliestIssuedAt: string | null = null
  let latestIssuedAt: string | null = null
  const reasonMap = new Map<string, number>()

  for (const po of commerce.purchaseOrders ?? []) {
    const inv = po.supplierInvoice
    if (inv === undefined) continue
    totalInvoices++
    const issued = inv.issuedAt
    if (earliestIssuedAt === null || issued < earliestIssuedAt) earliestIssuedAt = issued
    if (latestIssuedAt === null || issued > latestIssuedAt) latestIssuedAt = issued
    const reason = inv.recording.reason
    reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1)
  }

  const topRecordingReasonsByCount = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 5)

  return {
    totalInvoices,
    earliestIssuedAt,
    latestIssuedAt,
    uniqueRecordingReasons: reasonMap.size,
    topRecordingReasonsByCount,
  }
}

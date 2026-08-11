import type { CommerceState } from './commerce-workspace.ts'

export type ShopSupplierCreditNoteMetaBrief = {
  totalNotes: number
  totalAmountMmk: number
  averageAmountMmk: number
  uniqueSupplierReferences: number
  topSupplierReferencesByCount: Array<{ reference: string; count: number }>
  earliestIssuedAt: string | null
  latestIssuedAt: string | null
}

export function projectShopSupplierCreditNoteMetaBrief(
  commerce: CommerceState,
): ShopSupplierCreditNoteMetaBrief {
  let totalNotes = 0
  let totalAmountMmk = 0
  let earliestIssuedAt: string | null = null
  let latestIssuedAt: string | null = null
  const refMap = new Map<string, number>()

  for (const po of commerce.purchaseOrders ?? []) {
    for (const claim of po.supplierReturns ?? []) {
      for (const note of claim.creditNotes) {
        totalNotes++
        totalAmountMmk += note.amountMmk
        const ref = note.supplierReference
        refMap.set(ref, (refMap.get(ref) ?? 0) + 1)
        const issued = note.issuedAt
        if (earliestIssuedAt === null || issued < earliestIssuedAt) earliestIssuedAt = issued
        if (latestIssuedAt === null || issued > latestIssuedAt) latestIssuedAt = issued
      }
    }
  }

  const topSupplierReferencesByCount = Array.from(refMap.entries())
    .map(([reference, count]) => ({ reference, count }))
    .sort((a, b) => b.count - a.count || a.reference.localeCompare(b.reference))
    .slice(0, 5)

  return {
    totalNotes,
    totalAmountMmk,
    averageAmountMmk: totalNotes > 0 ? Math.round(totalAmountMmk / totalNotes) : 0,
    uniqueSupplierReferences: refMap.size,
    topSupplierReferencesByCount,
    earliestIssuedAt,
    latestIssuedAt,
  }
}

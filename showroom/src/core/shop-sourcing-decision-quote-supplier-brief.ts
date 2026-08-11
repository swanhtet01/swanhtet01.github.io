import type { CommerceState } from './commerce-workspace.ts'

export type ShopSourcingDecisionQuoteSupplierBrief = {
  totalDecisions: number
  totalQuotes: number
  uniqueQuoteSuppliers: number
  topQuoteSuppliersByCount: Array<{ supplier: string; count: number }>
}

export function projectShopSourcingDecisionQuoteSupplierBrief(
  commerce: CommerceState,
): ShopSourcingDecisionQuoteSupplierBrief {
  let totalDecisions = 0
  let totalQuotes = 0
  const supplierMap = new Map<string, number>()

  for (const decision of commerce.supplierSourcingDecisions ?? []) {
    totalDecisions++
    for (const quote of decision.quotes) {
      totalQuotes++
      supplierMap.set(quote.supplier, (supplierMap.get(quote.supplier) ?? 0) + 1)
    }
  }

  const topQuoteSuppliersByCount = Array.from(supplierMap.entries())
    .map(([supplier, count]) => ({ supplier, count }))
    .sort((a, b) => b.count - a.count || a.supplier.localeCompare(b.supplier))
    .slice(0, 5)

  return {
    totalDecisions,
    totalQuotes,
    uniqueQuoteSuppliers: supplierMap.size,
    topQuoteSuppliersByCount,
  }
}

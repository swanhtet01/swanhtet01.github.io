import type { CommerceState } from './commerce-workspace.ts'

export type SupplierSourcingRecord = {
  supplier: string
  winsCount: number
  totalQuantityWon: number
}

export type ShopSupplierSourcingSummary = {
  totalDecisions: number
  totalQuantitySourced: number
  uniqueSkus: number
  totalQuotesEvaluated: number
  averageQuotesPerDecision: number
  bySupplier: SupplierSourcingRecord[]
}

export function projectShopSupplierSourcingSummary(commerce: CommerceState): ShopSupplierSourcingSummary {
  const decisions = commerce.supplierSourcingDecisions ?? []
  const skuSet = new Set<string>()
  const supplierMap = new Map<string, { winsCount: number; totalQuantityWon: number }>()

  let totalQuantitySourced = 0
  let totalQuotesEvaluated = 0

  for (const decision of decisions) {
    skuSet.add(decision.sku)
    totalQuantitySourced += decision.quantity
    totalQuotesEvaluated += decision.quotes.length

    const selectedQuote = decision.quotes.find(q => q.quoteReference === decision.selectedQuoteReference)
    if (selectedQuote) {
      const entry = supplierMap.get(selectedQuote.supplier) ?? { winsCount: 0, totalQuantityWon: 0 }
      entry.winsCount++
      entry.totalQuantityWon += decision.quantity
      supplierMap.set(selectedQuote.supplier, entry)
    }
  }

  const bySupplier: SupplierSourcingRecord[] = Array.from(supplierMap.entries())
    .map(([supplier, { winsCount, totalQuantityWon }]) => ({ supplier, winsCount, totalQuantityWon }))
    .sort((a, b) => b.winsCount - a.winsCount || a.supplier.localeCompare(b.supplier))

  return {
    totalDecisions: decisions.length,
    totalQuantitySourced,
    uniqueSkus: skuSet.size,
    totalQuotesEvaluated,
    averageQuotesPerDecision: decisions.length > 0 ? Math.round(totalQuotesEvaluated / decisions.length) : 0,
    bySupplier,
  }
}

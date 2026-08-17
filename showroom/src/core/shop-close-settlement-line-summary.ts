import type { CommerceState } from './commerce-workspace.ts'

export type ShopSettlementMethodEntry = {
  paymentMethod: string
  totalExpectedMmk: number
  totalCountedMmk: number
  totalVarianceMmk: number
  closesWithVariance: number
}

export type ShopCloseSettlementLineSummary = {
  closesWithSettlement: number
  totalSettlementLines: number
  uniquePaymentMethods: number
  byPaymentMethod: ShopSettlementMethodEntry[]
  highestVarianceMethod: string | null
}

export function projectShopCloseSettlementLineSummary(commerce: CommerceState): ShopCloseSettlementLineSummary {
  const methodMap = new Map<string, ShopSettlementMethodEntry>()
  let closesWithSettlement = 0
  let totalSettlementLines = 0

  for (const close of commerce.closes) {
    if (!close.settlement) continue
    closesWithSettlement++
    for (const line of close.settlement.lines) {
      totalSettlementLines++
      const method = line.paymentMethod
      const entry = methodMap.get(method)
      if (entry) {
        entry.totalExpectedMmk += line.expectedMmk
        entry.totalCountedMmk += line.countedMmk
        entry.totalVarianceMmk += line.varianceMmk
        if (line.status === 'variance_review') entry.closesWithVariance++
      } else {
        methodMap.set(method, {
          paymentMethod: method,
          totalExpectedMmk: line.expectedMmk,
          totalCountedMmk: line.countedMmk,
          totalVarianceMmk: line.varianceMmk,
          closesWithVariance: line.status === 'variance_review' ? 1 : 0,
        })
      }
    }
  }

  const byPaymentMethod = Array.from(methodMap.values()).sort(
    (a, b) => Math.abs(b.totalVarianceMmk) - Math.abs(a.totalVarianceMmk)
  )

  const highestVarianceMethod = byPaymentMethod.length > 0
    ? byPaymentMethod[0].paymentMethod
    : null

  return {
    closesWithSettlement,
    totalSettlementLines,
    uniquePaymentMethods: methodMap.size,
    byPaymentMethod,
    highestVarianceMethod,
  }
}

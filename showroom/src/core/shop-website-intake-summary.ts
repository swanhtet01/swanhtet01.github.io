import type { CommerceState } from './commerce-workspace.ts'

export type ShopWebsiteIntakeSummary = {
  totalIntakes: number
  pendingConfirmation: number
  converted: number
  conversionRate: number
  totalQuantityRequested: number
  totalValueRequested: number
  uniqueSkus: number
}

export function projectShopWebsiteIntakeSummary(commerce: CommerceState): ShopWebsiteIntakeSummary {
  const intakes = commerce.websiteIntakes ?? []
  const skuSet = new Set<string>()

  let pendingConfirmation = 0
  let converted = 0
  let totalQuantityRequested = 0
  let totalValueRequested = 0

  for (const intake of intakes) {
    if (intake.status === 'converted') converted++
    else pendingConfirmation++

    totalQuantityRequested += intake.quantity
    totalValueRequested += intake.total
    skuSet.add(intake.sku)
  }

  return {
    totalIntakes: intakes.length,
    pendingConfirmation,
    converted,
    conversionRate: intakes.length > 0 ? Math.round((converted / intakes.length) * 100) : 0,
    totalQuantityRequested,
    totalValueRequested,
    uniqueSkus: skuSet.size,
  }
}

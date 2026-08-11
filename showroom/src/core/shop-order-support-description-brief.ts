import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderSupportDescriptionBrief = {
  totalCases: number
  totalDescriptionLength: number
  averageDescriptionLength: number
  minDescriptionLength: number | null
  maxDescriptionLength: number | null
}

export function projectShopOrderSupportDescriptionBrief(
  commerce: CommerceState,
): ShopOrderSupportDescriptionBrief {
  let totalCases = 0
  let totalDescriptionLength = 0
  let minDescriptionLength: number | null = null
  let maxDescriptionLength: number | null = null

  for (const order of commerce.orders) {
    for (const supportCase of order.supportCases ?? []) {
      totalCases++
      const len = supportCase.customerDescription.length
      totalDescriptionLength += len
      if (minDescriptionLength === null || len < minDescriptionLength) minDescriptionLength = len
      if (maxDescriptionLength === null || len > maxDescriptionLength) maxDescriptionLength = len
    }
  }

  return {
    totalCases,
    totalDescriptionLength,
    averageDescriptionLength: totalCases > 0 ? Math.round(totalDescriptionLength / totalCases) : 0,
    minDescriptionLength,
    maxDescriptionLength,
  }
}

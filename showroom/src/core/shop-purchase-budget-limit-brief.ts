import type { CommerceState } from './commerce-workspace.ts'

export type ShopPurchaseBudgetLimitBrief = {
  totalEnvelopes: number
  totalPerRequisitionLimitMmk: number
  averagePerRequisitionLimitMmk: number
  minPerRequisitionLimitMmk: number | null
  maxPerRequisitionLimitMmk: number | null
}

export function projectShopPurchaseBudgetLimitBrief(commerce: CommerceState): ShopPurchaseBudgetLimitBrief {
  const envelopes = commerce.purchaseBudgetEnvelopes ?? []
  let totalEnvelopes = 0
  let totalPerRequisitionLimitMmk = 0
  let minPerRequisitionLimitMmk: number | null = null
  let maxPerRequisitionLimitMmk: number | null = null

  for (const envelope of envelopes) {
    totalEnvelopes++
    const lim = envelope.perRequisitionLimitMmk
    totalPerRequisitionLimitMmk += lim
    if (minPerRequisitionLimitMmk === null || lim < minPerRequisitionLimitMmk) minPerRequisitionLimitMmk = lim
    if (maxPerRequisitionLimitMmk === null || lim > maxPerRequisitionLimitMmk) maxPerRequisitionLimitMmk = lim
  }

  return {
    totalEnvelopes,
    totalPerRequisitionLimitMmk,
    averagePerRequisitionLimitMmk: totalEnvelopes > 0 ? Math.round(totalPerRequisitionLimitMmk / totalEnvelopes) : 0,
    minPerRequisitionLimitMmk,
    maxPerRequisitionLimitMmk,
  }
}

import type { CommerceState } from './commerce-workspace.ts'

export type ShopBudgetEnvelopeCeilingBrief = {
  totalEnvelopes: number
  totalCeilingMmk: number
  averageCeilingMmk: number
  minCeilingMmk: number | null
  maxCeilingMmk: number | null
  totalPerRequisitionLimitMmk: number
  averagePerRequisitionLimitMmk: number
  minPerRequisitionLimitMmk: number | null
  maxPerRequisitionLimitMmk: number | null
}

export function projectShopBudgetEnvelopeCeilingBrief(
  commerce: CommerceState,
): ShopBudgetEnvelopeCeilingBrief {
  let totalEnvelopes = 0
  let totalCeilingMmk = 0
  let minCeilingMmk: number | null = null
  let maxCeilingMmk: number | null = null
  let totalPerRequisitionLimitMmk = 0
  let minPerRequisitionLimitMmk: number | null = null
  let maxPerRequisitionLimitMmk: number | null = null

  for (const env of commerce.purchaseBudgetEnvelopes ?? []) {
    totalEnvelopes++

    const ceiling = env.ceilingMmk
    totalCeilingMmk += ceiling
    if (minCeilingMmk === null || ceiling < minCeilingMmk) minCeilingMmk = ceiling
    if (maxCeilingMmk === null || ceiling > maxCeilingMmk) maxCeilingMmk = ceiling

    const perReq = env.perRequisitionLimitMmk
    totalPerRequisitionLimitMmk += perReq
    if (minPerRequisitionLimitMmk === null || perReq < minPerRequisitionLimitMmk)
      minPerRequisitionLimitMmk = perReq
    if (maxPerRequisitionLimitMmk === null || perReq > maxPerRequisitionLimitMmk)
      maxPerRequisitionLimitMmk = perReq
  }

  return {
    totalEnvelopes,
    totalCeilingMmk,
    averageCeilingMmk:
      totalEnvelopes > 0 ? Math.round(totalCeilingMmk / totalEnvelopes) : 0,
    minCeilingMmk,
    maxCeilingMmk,
    totalPerRequisitionLimitMmk,
    averagePerRequisitionLimitMmk:
      totalEnvelopes > 0 ? Math.round(totalPerRequisitionLimitMmk / totalEnvelopes) : 0,
    minPerRequisitionLimitMmk,
    maxPerRequisitionLimitMmk,
  }
}

import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceAmendmentIntentOriginalTotalBrief = {
  totalIntents: number
  totalOriginalMmk: number
  averageOriginalMmk: number
  minOriginalMmk: number | null
  maxOriginalMmk: number | null
}

export function projectEcommerceAmendmentIntentOriginalTotalBrief(
  buying: EcommerceBuyingState,
): EcommerceAmendmentIntentOriginalTotalBrief {
  const total = buying.amendmentIntents.length
  let sum = 0
  let min: number | null = null
  let max: number | null = null

  for (const intent of buying.amendmentIntents) {
    const mmk = intent.originalTotalMmk
    sum += mmk
    if (min === null || mmk < min) min = mmk
    if (max === null || mmk > max) max = mmk
  }

  return {
    totalIntents: total,
    totalOriginalMmk: sum,
    averageOriginalMmk: total > 0 ? Math.round(sum / total) : 0,
    minOriginalMmk: min,
    maxOriginalMmk: max,
  }
}

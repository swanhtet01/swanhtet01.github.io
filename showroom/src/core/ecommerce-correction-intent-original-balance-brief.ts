import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentOriginalBalanceBrief = {
  totalIntents: number
  minOriginalBalanceMmk: number | null
  maxOriginalBalanceMmk: number | null
  sumOriginalBalanceMmk: number
}

export function projectEcommerceCorrectionIntentOriginalBalanceBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentOriginalBalanceBrief {
  const total = buying.correctionIntents.length
  if (total === 0)
    return {
      totalIntents: 0,
      minOriginalBalanceMmk: null,
      maxOriginalBalanceMmk: null,
      sumOriginalBalanceMmk: 0,
    }
  let min = buying.correctionIntents[0].originalBalanceMmk
  let max = buying.correctionIntents[0].originalBalanceMmk
  let sum = 0
  for (const intent of buying.correctionIntents) {
    if (intent.originalBalanceMmk < min) min = intent.originalBalanceMmk
    if (intent.originalBalanceMmk > max) max = intent.originalBalanceMmk
    sum += intent.originalBalanceMmk
  }
  return {
    totalIntents: total,
    minOriginalBalanceMmk: min,
    maxOriginalBalanceMmk: max,
    sumOriginalBalanceMmk: sum,
  }
}

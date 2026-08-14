import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceCorrectionIntentListedAmountBrief = {
  totalIntents: number; minListedAmountMmk: number | null; maxListedAmountMmk: number | null; sumListedAmountMmk: number
}
export function projectEcommerceCorrectionIntentListedAmountBrief(buying: EcommerceBuyingState) {
  const total = buying.correctionIntents.length
  if (total === 0) return { totalIntents: 0, minListedAmountMmk: null, maxListedAmountMmk: null, sumListedAmountMmk: 0 }
  let min = buying.correctionIntents[0].listedAmountMmk; let max = buying.correctionIntents[0].listedAmountMmk; let sum = 0
  for (const intent of buying.correctionIntents) {
    if (intent.listedAmountMmk < min) min = intent.listedAmountMmk
    if (intent.listedAmountMmk > max) max = intent.listedAmountMmk
    sum += intent.listedAmountMmk
  }
  return { totalIntents: total, minListedAmountMmk: min, maxListedAmountMmk: max, sumListedAmountMmk: sum }
}

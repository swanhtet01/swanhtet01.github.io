import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentTotalMmkBrief = {
  totalIntents: number
  minTotalMmk: number | null
  maxTotalMmk: number | null
  sumTotalMmk: number
}

export function projectEcommerceCancellationIntentTotalMmkBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentTotalMmkBrief {
  const total = buying.cancellationIntents.length
  if (total === 0)
    return { totalIntents: 0, minTotalMmk: null, maxTotalMmk: null, sumTotalMmk: 0 }
  let min = buying.cancellationIntents[0].totalMmk
  let max = buying.cancellationIntents[0].totalMmk
  let sum = 0
  for (const intent of buying.cancellationIntents) {
    if (intent.totalMmk < min) min = intent.totalMmk
    if (intent.totalMmk > max) max = intent.totalMmk
    sum += intent.totalMmk
  }
  return { totalIntents: total, minTotalMmk: min, maxTotalMmk: max, sumTotalMmk: sum }
}

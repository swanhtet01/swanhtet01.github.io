import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentSourceCorrectionCountBrief = {
  totalIntents: number
  minSourceCorrectionCount: number | null
  maxSourceCorrectionCount: number | null
  firstCorrections: number
}

export function projectEcommerceCorrectionIntentSourceCorrectionCountBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentSourceCorrectionCountBrief {
  const total = buying.correctionIntents.length
  if (total === 0)
    return {
      totalIntents: 0,
      minSourceCorrectionCount: null,
      maxSourceCorrectionCount: null,
      firstCorrections: 0,
    }
  let min = buying.correctionIntents[0].sourceCorrectionCount
  let max = buying.correctionIntents[0].sourceCorrectionCount
  let firstCorrections = 0
  for (const intent of buying.correctionIntents) {
    if (intent.sourceCorrectionCount < min) min = intent.sourceCorrectionCount
    if (intent.sourceCorrectionCount > max) max = intent.sourceCorrectionCount
    if (intent.sourceCorrectionCount === 0) firstCorrections++
  }
  return {
    totalIntents: total,
    minSourceCorrectionCount: min,
    maxSourceCorrectionCount: max,
    firstCorrections,
  }
}

import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentAmountsBrief = {
  totalIntents: number
  totalListedAmountMmk: number
  minListedAmountMmk: number | null
  maxListedAmountMmk: number | null
  averageListedAmountMmk: number
  totalOriginalBalanceMmk: number
  minOriginalBalanceMmk: number | null
  maxOriginalBalanceMmk: number | null
  averageOriginalBalanceMmk: number
  minSourceCorrectionCount: number | null
  maxSourceCorrectionCount: number | null
  averageSourceCorrectionCount: number
}

export function projectEcommerceCorrectionIntentAmountsBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentAmountsBrief {
  let totalListedAmountMmk = 0
  let minListedAmountMmk: number | null = null
  let maxListedAmountMmk: number | null = null
  let totalOriginalBalanceMmk = 0
  let minOriginalBalanceMmk: number | null = null
  let maxOriginalBalanceMmk: number | null = null
  let totalSourceCorrectionCount = 0
  let minSourceCorrectionCount: number | null = null
  let maxSourceCorrectionCount: number | null = null

  for (const intent of buying.correctionIntents) {
    totalListedAmountMmk += intent.listedAmountMmk
    if (minListedAmountMmk === null || intent.listedAmountMmk < minListedAmountMmk)
      minListedAmountMmk = intent.listedAmountMmk
    if (maxListedAmountMmk === null || intent.listedAmountMmk > maxListedAmountMmk)
      maxListedAmountMmk = intent.listedAmountMmk

    totalOriginalBalanceMmk += intent.originalBalanceMmk
    if (minOriginalBalanceMmk === null || intent.originalBalanceMmk < minOriginalBalanceMmk)
      minOriginalBalanceMmk = intent.originalBalanceMmk
    if (maxOriginalBalanceMmk === null || intent.originalBalanceMmk > maxOriginalBalanceMmk)
      maxOriginalBalanceMmk = intent.originalBalanceMmk

    totalSourceCorrectionCount += intent.sourceCorrectionCount
    if (minSourceCorrectionCount === null || intent.sourceCorrectionCount < minSourceCorrectionCount)
      minSourceCorrectionCount = intent.sourceCorrectionCount
    if (maxSourceCorrectionCount === null || intent.sourceCorrectionCount > maxSourceCorrectionCount)
      maxSourceCorrectionCount = intent.sourceCorrectionCount
  }

  const totalIntents = buying.correctionIntents.length

  return {
    totalIntents,
    totalListedAmountMmk,
    minListedAmountMmk,
    maxListedAmountMmk,
    averageListedAmountMmk: totalIntents > 0 ? Math.round(totalListedAmountMmk / totalIntents) : 0,
    totalOriginalBalanceMmk,
    minOriginalBalanceMmk,
    maxOriginalBalanceMmk,
    averageOriginalBalanceMmk: totalIntents > 0 ? Math.round(totalOriginalBalanceMmk / totalIntents) : 0,
    minSourceCorrectionCount,
    maxSourceCorrectionCount,
    averageSourceCorrectionCount: totalIntents > 0 ? Math.round(totalSourceCorrectionCount / totalIntents) : 0,
  }
}

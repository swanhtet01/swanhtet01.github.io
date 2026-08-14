import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentKindAmountBrief = {
  totalIntents: number
  creditCount: number
  debitCount: number
  creditTotalMmk: number
  creditAverageMmk: number
  debitTotalMmk: number
  debitAverageMmk: number
}

export function projectEcommerceCorrectionIntentKindAmountBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentKindAmountBrief {
  const total = buying.correctionIntents.length
  if (total === 0)
    return { totalIntents: 0, creditCount: 0, debitCount: 0, creditTotalMmk: 0, creditAverageMmk: 0, debitTotalMmk: 0, debitAverageMmk: 0 }
  let creditCount = 0; let debitCount = 0
  let creditTotalMmk = 0; let debitTotalMmk = 0
  for (const intent of buying.correctionIntents) {
    if (intent.requestedKind === 'credit') {
      creditCount++
      creditTotalMmk += intent.listedAmountMmk
    } else {
      debitCount++
      debitTotalMmk += intent.listedAmountMmk
    }
  }
  return {
    totalIntents: total,
    creditCount,
    debitCount,
    creditTotalMmk,
    creditAverageMmk: creditCount > 0 ? Math.round(creditTotalMmk / creditCount) : 0,
    debitTotalMmk,
    debitAverageMmk: debitCount > 0 ? Math.round(debitTotalMmk / debitCount) : 0,
  }
}

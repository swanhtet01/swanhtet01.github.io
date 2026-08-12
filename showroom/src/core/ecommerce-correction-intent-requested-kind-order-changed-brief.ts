import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentRequestedKindOrderChangedBrief = {
  totalIntents: number
  creditOrderChangedCount: number
  creditNoOrderChangeCount: number
  debitOrderChangedCount: number
  debitNoOrderChangeCount: number
  creditCount: number
  debitCount: number
}

export function projectEcommerceCorrectionIntentRequestedKindOrderChangedBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentRequestedKindOrderChangedBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      creditOrderChangedCount: 0,
      creditNoOrderChangeCount: 0,
      debitOrderChangedCount: 0,
      debitNoOrderChangeCount: 0,
      creditCount: 0,
      debitCount: 0,
    }
  }

  let creditOrderChangedCount = 0
  let creditNoOrderChangeCount = 0
  let debitOrderChangedCount = 0
  let debitNoOrderChangeCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.requestedKind === 'credit') {
      if (intent.orderChanged) creditOrderChangedCount++
      else creditNoOrderChangeCount++
    } else {
      if (intent.orderChanged) debitOrderChangedCount++
      else debitNoOrderChangeCount++
    }
  }

  return {
    totalIntents: total,
    creditOrderChangedCount,
    creditNoOrderChangeCount,
    debitOrderChangedCount,
    debitNoOrderChangeCount,
    creditCount: creditOrderChangedCount + creditNoOrderChangeCount,
    debitCount: debitOrderChangedCount + debitNoOrderChangeCount,
  }
}

import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentKindSourceCountBrief = {
  totalIntents: number
  creditFirstCount: number
  creditRepeatCount: number
  debitFirstCount: number
  debitRepeatCount: number
  creditCount: number
  debitCount: number
}

export function projectEcommerceCorrectionIntentKindSourceCountBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentKindSourceCountBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      creditFirstCount: 0,
      creditRepeatCount: 0,
      debitFirstCount: 0,
      debitRepeatCount: 0,
      creditCount: 0,
      debitCount: 0,
    }
  }

  let creditFirstCount = 0
  let creditRepeatCount = 0
  let debitFirstCount = 0
  let debitRepeatCount = 0

  for (const intent of buying.correctionIntents) {
    const isCredit = intent.requestedKind === 'credit'
    const isFirst = intent.sourceCorrectionCount === 0
    if (isCredit) {
      if (isFirst) creditFirstCount++
      else creditRepeatCount++
    } else {
      if (isFirst) debitFirstCount++
      else debitRepeatCount++
    }
  }

  return {
    totalIntents: total,
    creditFirstCount,
    creditRepeatCount,
    debitFirstCount,
    debitRepeatCount,
    creditCount: creditFirstCount + creditRepeatCount,
    debitCount: debitFirstCount + debitRepeatCount,
  }
}

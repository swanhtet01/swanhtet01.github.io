import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentSourceCountKindBrief = {
  totalIntents: number
  firstCorrectionCount: number
  repeatCorrectionCount: number
  firstCreditCount: number
  firstDebitCount: number
  repeatCreditCount: number
  repeatDebitCount: number
}

export function projectEcommerceCorrectionIntentSourceCountKindBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentSourceCountKindBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      firstCorrectionCount: 0,
      repeatCorrectionCount: 0,
      firstCreditCount: 0,
      firstDebitCount: 0,
      repeatCreditCount: 0,
      repeatDebitCount: 0,
    }
  }

  let firstCreditCount = 0
  let firstDebitCount = 0
  let repeatCreditCount = 0
  let repeatDebitCount = 0

  for (const intent of buying.correctionIntents) {
    const isFirst = intent.sourceCorrectionCount === 0
    const isCredit = intent.requestedKind === 'credit'
    if (isFirst) {
      if (isCredit) firstCreditCount++
      else firstDebitCount++
    } else {
      if (isCredit) repeatCreditCount++
      else repeatDebitCount++
    }
  }

  const firstCorrectionCount = firstCreditCount + firstDebitCount
  const repeatCorrectionCount = repeatCreditCount + repeatDebitCount

  return {
    totalIntents: total,
    firstCorrectionCount,
    repeatCorrectionCount,
    firstCreditCount,
    firstDebitCount,
    repeatCreditCount,
    repeatDebitCount,
  }
}

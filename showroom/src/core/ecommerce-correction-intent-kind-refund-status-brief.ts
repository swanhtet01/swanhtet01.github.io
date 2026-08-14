import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentKindRefundStatusBrief = {
  totalIntents: number
  creditCount: number
  debitCount: number
  creditNoneCount: number
  creditDueCount: number
  creditSettledCount: number
  debitNoneCount: number
  debitDueCount: number
  debitSettledCount: number
}

export function projectEcommerceCorrectionIntentKindRefundStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentKindRefundStatusBrief {
  const total = buying.correctionIntents.length
  if (total === 0)
    return {
      totalIntents: 0, creditCount: 0, debitCount: 0,
      creditNoneCount: 0, creditDueCount: 0, creditSettledCount: 0,
      debitNoneCount: 0, debitDueCount: 0, debitSettledCount: 0,
    }
  let creditCount = 0; let debitCount = 0
  let creditNoneCount = 0; let creditDueCount = 0; let creditSettledCount = 0
  let debitNoneCount = 0; let debitDueCount = 0; let debitSettledCount = 0
  for (const intent of buying.correctionIntents) {
    const isCredit = intent.requestedKind === 'credit'
    if (isCredit) {
      creditCount++
      if (intent.refundStatus === 'none') creditNoneCount++
      else if (intent.refundStatus === 'due') creditDueCount++
      else creditSettledCount++
    } else {
      debitCount++
      if (intent.refundStatus === 'none') debitNoneCount++
      else if (intent.refundStatus === 'due') debitDueCount++
      else debitSettledCount++
    }
  }
  return {
    totalIntents: total, creditCount, debitCount,
    creditNoneCount, creditDueCount, creditSettledCount,
    debitNoneCount, debitDueCount, debitSettledCount,
  }
}
